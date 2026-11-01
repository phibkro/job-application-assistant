(ns ws24.facts
  "Fact<T>: claims -> facts over one closed JobPosting attribute set (D06).

  Every observation, from every source, yields exactly one fact per closed
  attribute. Sources differ only in each fact's `:state` and `:evidence`,
  never in which keys exist. Claims a method does not consume are `residue`.
  Everything here is pure and versioned by `method`."
  (:require [clojure.spec.alpha :as s]
            [clojure.string :as str]))

(def method "ws24-facts/0")

(def attributes
  "The closed attribute set (schema.org JobPosting vocabulary)."
  [:schema/title :schema/hiringOrganization :schema/taxID :schema/jobLocation
   :schema/url :schema/workHours])

(def states #{:stated :derived :negotiable :conflicting :unknown :temp-unknown :unsupported})
(def informative #{:stated :derived :negotiable})
(def determined #{:stated :derived})

;; ---------------------------------------------------------------- shape

(s/def ::attr (set attributes))
(s/def ::state states)
(s/def ::method string?)
(s/def ::evidence (s/coll-of string? :kind set?))
(s/def ::value string?)
(s/def ::fte (s/and (s/tuple double? double?) (fn [[lo hi]] (<= 0.0 lo hi 1.0))))
(s/def ::schedule #{:full-time :part-time})
(s/def ::fact
  (s/and (s/keys :req-un [::attr ::state ::method ::evidence] :opt-un [::value ::fte ::schedule])
         ;; A determined workload has an interval; nothing else may carry one.
         (fn [{:keys [attr state fte]}]
           (if (= attr :schema/workHours)
             (= (boolean (determined state)) (some? fte))
             (nil? fte)))))

;; ---------------------------------------------------------------- text

(defn normalize-text [s] (-> (or s "") str/trim str/lower-case (str/replace #"\s+" " ")))

(defn html->text [s]
  (-> (or s "") (str/replace #"<[^>]+>" " ") (str/replace "&nbsp;" " ") (str/replace #"\s+" " ") str/trim))

(defn blocking-key
  "Same fold as TS `deriveCanonicalKey`, but under D05 this is only a
  candidate-blocking key, never an identity."
  [title org location]
  (str/join " " (map normalize-text [title org location])))

;; ---------------------------------------------------------------- workload

(def ^:private range-re #"(\d{1,3})\s*%?\s*(?:-|–|—|til)\s*(\d{1,3})\s*%")
(def ^:private pct-re #"(\d{1,3})\s*%")
(def ^:private negotiable-re
  #"(?i)(stillingsprosent|stillingsstørrelse|arbeidstid|omfang)[^.]{0,40}etter avtale")

(defn- pct [s] (let [n (parse-long s)] (when (<= 1 n 100) (/ n 100.0))))

(defn text-values
  "Workload claims found in free text, as a set of `[:fte lo hi]` /
  `[:negotiable]`. Ranges are removed before single percentages are read, so
  `40–80 %` is one range, not a range plus `80 %`."
  [text]
  (let [ranges (for [[_ a b] (re-seq range-re text)
                     :let [lo (pct a) hi (pct b)]
                     :when (and lo hi (<= lo hi))]
                 [:fte lo hi])
        rest-text (str/replace text range-re " ")
        singles (for [[_ a] (re-seq pct-re rest-text) :let [p (pct a)] :when p] [:fte p p])]
    (cond-> (set (concat ranges singles))
      (re-find negotiable-re text) (conj [:negotiable]))))

(def schedule-of {"heltid" :full-time "deltid" :part-time})

(defn derive-workload
  "The D06 decision table, total over (hydrated?, extent, text claims).

  | extent \\ text | none        | one %/range              | negotiable  |
  | none          | Unknown     | Derived                  | Negotiable  |
  | Heltid        | Stated 100% | Stated if 100% else Confl | Conflicting |
  | Deltid        | Unsupported | Derived if lo<1 else Confl| Negotiable  |
  Not hydrated (feed summary only): TempUnknown. More than one distinct text
  value: Conflicting. Heltid -> [1.0 1.0] is the declared category mapping
  (a variable, D06 'FTE reference hours')."
  [{:keys [hydrated? extent text]}]
  (let [schedule (schedule-of (normalize-text extent))
        values (text-values (or text ""))
        ev (cond-> (into #{} (map pr-str) values)
             extent (conj (str "extent=" extent)))
        fact (fn [state & {:as more}]
               (merge {:attr :schema/workHours :method method :state state :evidence ev}
                      (when schedule {:schedule schedule})
                      more))
        [v :as vs] (seq values)]
    (cond
      (not hydrated?) (fact :temp-unknown :evidence #{"summary carries no workload"})
      (and extent (nil? schedule)) (fact :unknown :evidence (conj ev "unrecognized extent"))
      (> (count vs) 1) (fact :conflicting)
      :else
      (let [[kind lo hi] v]
        (case [schedule kind]
          [nil nil] (fact :unknown :evidence #{"no workload claim"})
          [nil :fte] (fact :derived :fte [lo hi])
          [nil :negotiable] (fact :negotiable)
          [:full-time nil] (fact :stated :fte [1.0 1.0])
          [:full-time :fte] (if (= [lo hi] [1.0 1.0]) (fact :stated :fte [1.0 1.0]) (fact :conflicting))
          [:full-time :negotiable] (fact :conflicting)
          [:part-time nil] (fact :unsupported)
          [:part-time :fte] (if (< lo 1.0) (fact :derived :fte [lo hi]) (fact :conflicting))
          [:part-time :negotiable] (fact :negotiable))))))

;; ---------------------------------------------------------------- algebra

(defn interval-class
  "Query interval vs fact interval. `:within` = contained, `:overlaps` =
  intersects but not contained, `:outside` = disjoint. The overlap rule and
  query bounds are variables (D06)."
  [[qlo qhi] [lo hi]]
  (cond (and (<= qlo lo) (<= hi qhi)) :within
        (and (<= lo qhi) (<= qlo hi)) :overlaps
        :else :outside))

(defn classify
  "Only a determined fact (Stated/Derived) can match an interval; every other
  state is reported as itself, never coerced (missing % != 100%)."
  [q {:keys [state fte]}]
  (if (determined state) (interval-class q fte) :undetermined))

(def ^:private absent-rank {:unsupported 2 :unknown 1 :temp-unknown 0})

(defn fuse
  "Versioned fusion of workload facts across a vacancy's occurrences.
  A function of the *set* of inputs, so commutative and idempotent by
  construction; associativity is checked as a law. Distinct informative
  values, or disagreeing schedules, fuse to Conflicting with all evidence."
  [facts]
  (let [facts (vec facts)
        evidence (into #{} (mapcat :evidence) facts)
        schedules (into #{} (keep :schedule) facts)
        value-of (fn [{:keys [state fte]}] (if (= state :negotiable) :negotiable fte))
        infos (filter (comp informative :state) facts)
        values (into #{} (map value-of) infos)
        base {:attr :schema/workHours :method method :evidence evidence}
        with-schedule (fn [m] (cond-> m (= 1 (count schedules)) (assoc :schedule (first schedules))))]
    (cond
      (or (some (comp #{:conflicting} :state) facts) (> (count values) 1) (> (count schedules) 1))
      ;; No schedule on a fused conflict: keeping one lost the disagreement on
      ;; re-fusion (associativity counterexample found by the law test).
      (assoc base :state :conflicting)

      (= 1 (count values))
      (let [v (first values)
            state (cond (= v :negotiable) :negotiable
                        (some (comp #{:stated} :state) infos) :stated
                        :else :derived)]
        (with-schedule (cond-> (assoc base :state state) (vector? v) (assoc :fte v))))

      (empty? facts) (assoc base :state :unknown)

      :else
      (with-schedule (assoc base :state (apply max-key absent-rank (map :state facts)))))))

;; ---------------------------------------------------------------- claims -> facts

(defn- simple-fact [attr value & {:keys [state evidence] :or {state :stated}}]
  (if (str/blank? value)
    {:attr attr :method method :state :unknown :evidence #{"absent"}}
    {:attr attr :method method :state state :value value :evidence (or evidence #{(str "mapped " attr)})}))

(defn- first-claim [claims paths] (some #(let [v (get claims %)] (when-not (str/blank? v) v)) paths))

(defn- nav-location [claims]
  (or (first-claim claims (for [i (range 50) k ["city" "municipal" "county"]]
                            (str "ad_content.workLocations[" i "]." k)))
      (get claims "_feed_entry.municipal")))

(def consumed-paths
  "Claim paths a method maps onto attributes; every other claim is residue."
  #{"_feed_entry.title" "title" "_feed_entry.businessName" "_feed_entry.municipal"
    "ad_content.title" "ad_content.jobtitle" "ad_content.employer.name" "ad_content.employer.orgnr"
    "ad_content.applicationUrl" "ad_content.link" "ad_content.sourceurl" "ad_content.extent"
    "ad_content.description" "identifier" "hiringOrganization.name" "hiringOrganization.taxID"
    "jobLocation" "url" "workHours"})

(defn residue
  "Unmapped content, in one uniform shape for every source (D06 `RawClaim[]`)."
  [{:keys [claims]}]
  (into (sorted-map)
        (remove (fn [[p _]] (or (consumed-paths p) (str/starts-with? p "ad_content.workLocations["))))
        claims))

(defn nav-facts [{:keys [kind external-id claims]}]
  (let [detail? (= kind :detail)
        title (first-claim claims ["ad_content.title" "ad_content.jobtitle" "_feed_entry.title" "title"])
        org (first-claim claims ["ad_content.employer.name" "_feed_entry.businessName"])
        url (first-claim claims ["ad_content.applicationUrl" "ad_content.link" "ad_content.sourceurl"])]
    [(simple-fact :schema/title title)
     (simple-fact :schema/hiringOrganization org)
     (if detail?
       (simple-fact :schema/taxID (get claims "ad_content.employer.orgnr"))
       {:attr :schema/taxID :method method :state :temp-unknown :evidence #{"summary carries no orgnr"}})
     (simple-fact :schema/jobLocation (nav-location claims))
     (if url
       (simple-fact :schema/url url)
       (simple-fact :schema/url (str "https://arbeidsplassen.nav.no/stillinger/stilling/" external-id)
                    :state :derived :evidence #{"nav posting url from uuid"}))
     (derive-workload {:hydrated? detail?
                       :extent (get claims "ad_content.extent")
                       :text (html->text (get claims "ad_content.description"))})]))

(defn board-facts [{:keys [claims]}]
  [(simple-fact :schema/title (get claims "title"))
   (simple-fact :schema/hiringOrganization (get claims "hiringOrganization.name"))
   (simple-fact :schema/taxID (get claims "hiringOrganization.taxID"))
   (simple-fact :schema/jobLocation (get claims "jobLocation"))
   (simple-fact :schema/url (get claims "url"))
   (derive-workload {:hydrated? true :text (get claims "workHours")})])

(defn observation-facts [obs]
  (if (= "nav" (:source obs)) (nav-facts obs) (board-facts obs)))
