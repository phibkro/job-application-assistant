(ns ws24.store
  "Datomic Local (in-process, in-memory) store and the read model.

  Time axes. Recorded time is Datomic's transaction time: `d/as-of` and
  `d/since` are native. Valid time (the source's own `sistEndret` /
  `dateModified`) is an ordinary attribute, `:obs/source-modified`, and the
  'latest by valid time' selection is plain Clojure below. XTDB v2 would give
  that axis natively; it could not be resolved here (see the evidence README).

  Every strategy a falsifier depends on is a key of an `impl` map, so a
  negative control is the good impl with exactly one key swapped."
  (:require [datomic.client.api :as d]
            [ws24.facts :as facts]
            [ws24.nav :as nav])
  (:import (java.security MessageDigest)
           (java.util UUID)))

;; ---------------------------------------------------------------- schema

(defn- attr [ident type & {:keys [many unique]}]
  (cond-> {:db/ident ident :db/valueType (keyword "db.type" (name type))
           :db/cardinality (if many :db.cardinality/many :db.cardinality/one)}
    unique (assoc :db/unique :db.unique/identity)))

(def schema
  [(attr :occ/id :string :unique true) (attr :occ/source :string) (attr :occ/external-id :string)
   (attr :obs/id :string :unique true) (attr :obs/occurrence :ref) (attr :obs/kind :keyword)
   (attr :obs/status :string) (attr :obs/source-modified :instant)
   (attr :claim/id :string :unique true) (attr :claim/obs :ref) (attr :claim/path :string)
   (attr :claim/value :string)
   (attr :fact/id :string :unique true) (attr :fact/obs :ref) (attr :fact/attr :keyword)
   (attr :fact/state :keyword) (attr :fact/value :string) (attr :fact/fte-lo :double)
   (attr :fact/fte-hi :double) (attr :fact/schedule :keyword) (attr :fact/evidence :string :many true)
   (attr :fact/method :string)
   (attr :link/id :string :unique true) (attr :link/from :ref) (attr :link/to :ref)
   (attr :link/evidence :string :many true) (attr :link/method :string)])

(defonce ^:private client
  (delay (d/client {:server-type :datomic-local :storage-dir :mem :system "ws24"})))

(defn fresh-conn
  "A new empty in-memory database with the schema installed."
  []
  (let [db-name (str "ws24-" (UUID/randomUUID))]
    (d/create-database @client {:db-name db-name})
    (doto (d/connect @client {:db-name db-name})
      (d/transact {:tx-data schema}))))

;; ---------------------------------------------------------------- identity

(defn sha256 [& parts]
  (let [bytes (.digest (MessageDigest/getInstance "SHA-256")
                       (.getBytes (pr-str (vec parts)) "UTF-8"))]
    (apply str (map #(format "%02x" %) bytes))))

(defn content-obs-id
  "Content-addressed: identical payload => identical id => upsert no-op."
  [{:keys [source external-id kind status source-modified claims]}]
  (sha256 source external-id kind status (some-> source-modified .getTime) (seq claims)))

(defn source-occurrence-key
  "D05: occurrence identity is (source, externalId); never title-based."
  [{:keys [source external-id]}]
  (str source "|" external-id))

;; ---------------------------------------------------------------- ingest

(defn- fact->tx [oid {:keys [attr state value fte schedule evidence method]}]
  (cond-> {:fact/id (sha256 oid attr method) :fact/obs "obs" :fact/attr attr :fact/state state
           :fact/method method :fact/evidence (vec evidence)}
    value (assoc :fact/value value)
    fte (assoc :fact/fte-lo (first fte) :fact/fte-hi (second fte))
    schedule (assoc :fact/schedule schedule)))

(defn observation-tx [impl obs]
  (let [oid ((:obs-id impl) obs)
        occ ((:occurrence-key impl) obs)]
    (-> [{:db/id "occ" :occ/id occ :occ/source (:source obs) :occ/external-id (:external-id obs)}
         {:db/id "obs" :obs/id oid :obs/occurrence "occ" :obs/kind (:kind obs) :obs/status (:status obs)
          :obs/source-modified (:source-modified obs)}]
        (into (for [[p v] (:claims obs)]
                {:claim/id (sha256 oid p) :claim/obs "obs" :claim/path p :claim/value v}))
        (into (map (partial fact->tx oid)) ((:derive-facts impl) obs)))))

(defn ingest!
  "Transacts each observation in its own transaction (one receipt each).
  Returns the basis t after the last one and the number of non-transaction
  datoms the batch added: 0 means the batch was a semantic no-op."
  [impl conn observations]
  (reduce (fn [acc obs]
            (let [{:keys [db-after tx-data]} (d/transact conn {:tx-data (observation-tx impl obs)})
                  tx-e (:e (first (filter #(= (:e %) (:tx %)) tx-data)))]
              {:t (:t db-after)
               :datoms-added (+ (:datoms-added acc) (count (remove #(= (:e %) tx-e) tx-data)))}))
          {:t (:t (d/db conn)) :datoms-added 0}
          observations))

(defn link!
  "A versioned cross-source sameAs assertion with evidence (D05)."
  [conn from-occ to-occ evidence method]
  (d/transact conn {:tx-data [{:link/id (sha256 from-occ to-occ method)
                               :link/from [:occ/id from-occ] :link/to [:occ/id to-occ]
                               :link/evidence (vec evidence) :link/method method}]}))

;; ---------------------------------------------------------------- rules

(def recursive-rules
  "sameAs is symmetric; same-vacancy is its transitive closure. Links between
  two occurrences of the same source are ignored by the rule itself (D05)."
  '[[(linked ?a ?b) [?l :link/from ?a] [?l :link/to ?b]]
    [(linked ?a ?b) [?l :link/from ?b] [?l :link/to ?a]]
    [(cross-linked ?a ?b) (linked ?a ?b)
     [?a :occ/source ?sa] [?b :occ/source ?sb] [(not= ?sa ?sb)]]
    [(same-vacancy ?a ?b) (cross-linked ?a ?b)]
    [(same-vacancy ?a ?b) (cross-linked ?a ?x) (same-vacancy ?x ?b)]])

(defn same-vacancy-pairs [impl db]
  (d/q '[:find ?ai ?bi :in $ % :where (same-vacancy ?a ?b) [?a :occ/id ?ai] [?b :occ/id ?bi]]
       db (:rules impl)))

(defn within-source-merges
  "Invariant as a query: two occurrences of one source must never end up in
  one vacancy (possible through transitivity even when no single link is
  within-source). Must be empty."
  [impl db]
  (set (d/q '[:find ?ai ?bi :in $ % :where (same-vacancy ?a ?b) [(not= ?a ?b)]
              [?a :occ/source ?s] [?b :occ/source ?s] [?a :occ/id ?ai] [?b :occ/id ?bi]]
            db (:rules impl))))

;; ---------------------------------------------------------------- bitemporal selection

(defn- before? [valid-at d] (or (nil? valid-at) (not (.after ^java.util.Date d valid-at))))

(defn observations
  "Every observation recorded in `db` (already as-of some recorded t), with the
  transaction that first recorded it, filtered to valid time <= `valid-at`."
  [db valid-at]
  (->> (d/q '[:find ?occ-id ?src ?xid ?oid ?kind ?status ?mod ?tx
              :where [?o :occ/id ?occ-id] [?o :occ/source ?src] [?o :occ/external-id ?xid]
              [?b :obs/occurrence ?o] [?b :obs/id ?oid ?tx] [?b :obs/kind ?kind]
              [?b :obs/status ?status] [?b :obs/source-modified ?mod]]
            db)
       (map #(zipmap [:occ :source :external-id :obs :kind :status :modified :tx] %))
       (filter #(before? valid-at (:modified %)))))

(defn by-valid-time
  "Latest by the source's own clock. Arrival (transaction) order only breaks
  an exact tie of source timestamps, so a late-arriving older observation can
  never override a newer one."
  [o] [(.getTime ^java.util.Date (:modified o)) (:tx o) (:obs o)])

(defn by-recorded-time [o] [(:tx o) (:obs o)])

(defn facts-of [db]
  (->> (d/q '[:find (pull ?f [:fact/attr :fact/state :fact/value :fact/fte-lo :fact/fte-hi
                              :fact/schedule :fact/evidence :fact/method]) ?oid
              :where [?f :fact/obs ?b] [?b :obs/id ?oid]]
            db)
       (reduce (fn [m [f oid]]
                 (assoc-in m [oid (:fact/attr f)]
                           (cond-> {:attr (:fact/attr f) :state (:fact/state f) :method (:fact/method f)
                                    :evidence (set (:fact/evidence f))}
                             (:fact/value f) (assoc :value (:fact/value f))
                             (:fact/fte-lo f) (assoc :fte [(:fact/fte-lo f) (:fact/fte-hi f)])
                             (:fact/schedule f) (assoc :schedule (:fact/schedule f)))))
               {})))

(defn select-fact
  "Per occurrence and attribute: the latest observation (by `order`) that
  carries information for it; TempUnknown only when nothing else exists."
  [order obs-facts observations attr]
  (let [ordered (reverse (sort-by order observations))
        fs (keep #(get-in obs-facts [(:obs %) attr]) ordered)]
    (or (first (remove (comp #{:temp-unknown} :state) fs)) (first fs))))

(defn occurrence-states
  "occ-id -> {:source :external-id :status :facts {attr fact} :observations}."
  [impl db valid-at]
  (let [obs (observations db valid-at)
        obs-facts (facts-of db)]
    (into (sorted-map)
          (for [[occ os] (group-by :occ obs)]
            [occ {:source (:source (first os))
                  :external-id (:external-id (first os))
                  :status ((:status-of impl) os)
                  :observations (sort (map :obs os))
                  :facts (into {} (for [a facts/attributes]
                                    [a (select-fact (:order impl) obs-facts os a)]))}]))))

(defn latest-status [order] (fn [os] (:status (last (sort-by order os)))))

;; ---------------------------------------------------------------- read model

(defn clusters
  "Vacancies: each occurrence plus everything same-vacancy reaches from it."
  [impl db occ-ids]
  (let [reach (reduce (fn [m [a b]] (update m a (fnil conj #{}) b)) {} (same-vacancy-pairs impl db))]
    (into (sorted-set-by #(compare (vec (sort %1)) (vec (sort %2))))
          (map #(conj (get reach % #{}) %))
          occ-ids)))

(defn view
  "The query result a client sees: per vacancy, its source references, status,
  core facts and workload classified against `fte-query`. `recorded-t` (as-of)
  and `valid-at` are the two time axes; nil means 'now'."
  [impl conn {:keys [recorded-t valid-at fte-query] :or {fte-query [0.4 0.6]}}]
  (let [db (if recorded-t (((:as-of impl) recorded-t) (d/db conn)) (d/db conn))
        occs (occurrence-states impl db valid-at)]
    (vec
     (for [cluster (clusters impl db (keys occs))
           :let [members (keep #(some->> (get occs %) (merge {:occ %})) (sort cluster))
                 lead (first members)
                 workload ((:fuse impl) (keep #(get-in % [:facts :schema/workHours]) members))]
           :when lead]
       {:vacancy (set (map :occ members))
        :active? (boolean (some #(= "ACTIVE" (:status %)) members))
        :title (get-in lead [:facts :schema/title :value])
        :employer (get-in lead [:facts :schema/hiringOrganization :value])
        :location (get-in lead [:facts :schema/jobLocation :value])
        :sources (vec (for [m members]
                        {:source (:source m) :external-id (:external-id m)
                         :url (get-in m [:facts :schema/url :value])
                         :status (:status m) :observations (:observations m)}))
        :workload (assoc (select-keys workload [:state :fte :schedule])
                         :class ((:classify impl) fte-query workload))}))))

(defn changed-occurrences-since
  "Change cursor: occurrences that received a new observation after t."
  [conn t]
  (let [db (d/db conn)]
    (set (d/q '[:find ?occ-id :in $ $since
                :where [$since ?b :obs/occurrence ?o] [$ ?o :occ/id ?occ-id]]
              db (d/since db t)))))

;; ---------------------------------------------------------------- candidates (D05)

(defn candidate-links
  "Deterministic sameAs candidates: equal blocking key, compatible orgnr,
  different sources. A target with more than one same-source candidate is
  ambiguous and is not proposed (no merge without evidence)."
  [impl conn]
  (let [occs (occurrence-states impl (d/db conn) nil)
        keyed (for [[occ {:keys [source facts]}] occs]
                {:occ occ :source source
                 :orgnr (get-in facts [:schema/taxID :value])
                 :key (facts/blocking-key (get-in facts [:schema/title :value])
                                          (get-in facts [:schema/hiringOrganization :value])
                                          (get-in facts [:schema/jobLocation :value]))})
        by-key (group-by :key keyed)]
    (for [[k group] by-key
          a group, b group
          :when (and (neg? (compare (:occ a) (:occ b))) (not= (:source a) (:source b))
                     (or (nil? (:orgnr a)) (nil? (:orgnr b)) (= (:orgnr a) (:orgnr b)))
                     ((:unambiguous? impl) group a b))]
      [(:occ a) (:occ b) #{(str "blocking-key=" k) (str "orgnr=" (or (:orgnr a) (:orgnr b)))}])))

(defn unambiguous?
  "Neither side has a second candidate from the other's source."
  [group a b]
  (let [same-src (fn [x src] (count (filter #(and (= src (:source %)) (not= x %)) group)))]
    (and (zero? (same-src a (:source a))) (zero? (same-src b (:source b))))))

;; ---------------------------------------------------------------- the good impl

(def good
  {:name "good"
   :feed-observations nav/feed-observations
   :obs-id content-obs-id
   :occurrence-key source-occurrence-key
   :derive-facts facts/observation-facts
   :order by-valid-time
   :status-of (latest-status by-valid-time)
   :rules recursive-rules
   :unambiguous? unambiguous?
   :fuse facts/fuse
   :classify facts/classify
   :as-of (fn [t] (fn [db] (d/as-of db t)))})
