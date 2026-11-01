(ns ws24.laws-test
  "Property laws (test.check) over generated observation histories and facts."
  (:require [clojure.spec.alpha :as spec]
            [clojure.test :refer [deftest is]]
            [clojure.test.check :as tc]
            [clojure.test.check.generators :as gen]
            [clojure.test.check.properties :as prop]
            [ws24.facts :as facts]
            [ws24.fixtures :as fx]
            [ws24.store :as s]))

(def trials (or (some-> (System/getProperty "ws24.trials") parse-long) 40))

(defn- check [property]
  (let [result (tc/quick-check trials property :seed (or (some-> (System/getProperty "ws24.seed") parse-long)
                                                         20261101))]
    (is (:pass? result) (pr-str (select-keys result [:seed :fail :shrunk])))))

;; ---------------------------------------------------------------- generated histories
;; A pool of NAV detail observations: 3 adverts x 5 source times, each with a
;; status and workload text picked deterministically from (advert, hour).
;; Source times are distinct per advert, so valid-time order is total.

(def ^:private texts [nil fx/fifty "Stillingsprosent 40–80 %." "Stillingsprosent etter avtale."])

(def pool
  (vec (for [[i uuid] (map-indexed vector ["h-1" "h-2" "h-3"])
             hour (range 8 13)
             :let [k (+ (* 7 i) hour)]]
         (fx/nav-detail (fx/detail uuid :append (texts (mod k 4))
                                   :extent (get [nil "Heltid" "Deltid"] (mod k 3))
                                   :status (if (zero? (mod k 5)) "INACTIVE" "ACTIVE")
                                   :modified (format "2026-08-05T%02d:00:00Z" hour))))))

(def history (gen/vector (gen/elements pool) 1 10))

(deftest law-replay-is-idempotent
  (check (prop/for-all [h history]
           (let [conn (s/fresh-conn)]
             (s/ingest! s/good conn h)
             (let [v (s/view s/good conn {})]
               (and (zero? (:datoms-added (s/ingest! s/good conn h)))
                    (= v (s/view s/good conn {}))))))))

(deftest law-as-of-is-stable-under-later-observations
  (check (prop/for-all [h history, later history]
           (let [conn (s/fresh-conn)
                 t (:t (s/ingest! s/good conn h))
                 before (s/view s/good conn {})]
             (s/ingest! s/good conn later)
             (= before (s/view s/good conn {:recorded-t t}))))))

(deftest law-current-state-is-independent-of-arrival-order
  (check (prop/for-all [[h shuffled] (gen/bind history #(gen/tuple (gen/return %) (gen/shuffle %)))]
           (let [view-of (fn [xs] (let [c (s/fresh-conn)] (s/ingest! s/good c xs)
                                    (map #(update % :sources (partial map (fn [x] (dissoc x :observations))))
                                         (s/view s/good c {}))))]
             (= (view-of h) (view-of shuffled))))))

;; ---------------------------------------------------------------- fact algebra

(def fact-gen
  (gen/let [state (gen/elements (vec facts/states))
            lo (gen/elements [0.2 0.4 0.5 1.0])
            width (gen/elements [0.0 0.2 0.4])
            schedule (gen/elements [nil :full-time :part-time])
            ev (gen/set (gen/elements ["a" "b" "c"]))]
    (cond-> {:attr :schema/workHours :method facts/method :state state :evidence ev}
      (facts/determined state) (assoc :fte [lo (min 1.0 (+ lo width))])
      schedule (assoc :schedule schedule))))

(def facts-gen (gen/vector fact-gen 0 5))

(deftest law-fuse-is-commutative-idempotent-associative
  (check (prop/for-all [a facts-gen, b facts-gen]
           (let [xs (concat a b)]
             (and (= (facts/fuse xs) (facts/fuse (reverse xs)))
                  (= (facts/fuse xs) (facts/fuse (concat xs xs)))
                  (= (facts/fuse xs) (facts/fuse (remove nil? [(when (seq a) (facts/fuse a))
                                                               (when (seq b) (facts/fuse b))]))))))))

(deftest law-fused-and-derived-facts-conform-to-the-fact-shape
  (check (prop/for-all [xs (gen/not-empty facts-gen)
                        extent (gen/elements [nil "Heltid" "Deltid" "Heltid og deltid"])
                        text (gen/fmap #(apply str (interpose " " %))
                                       (gen/vector (gen/elements (conj (remove nil? texts) "100 %" "ingen")) 0 3))
                        hydrated? gen/boolean]
           (and (spec/valid? ::facts/fact (facts/fuse xs))
                (spec/valid? ::facts/fact (facts/derive-workload {:hydrated? hydrated? :extent extent :text text}))))))

(deftest law-only-determined-facts-can-match-an-interval
  (check (prop/for-all [f fact-gen, q (gen/elements [[0.4 0.6] [0.0 1.0] [1.0 1.0]])]
           (let [c (facts/classify q f)]
             (if (facts/determined (:state f))
               (contains? #{:within :overlaps :outside} c)
               (= :undetermined c))))))

(deftest law-interval-overlap-is-symmetric-and-within-implies-overlap
  (check (prop/for-all [a (gen/elements [[0.4 0.6] [0.5 0.5] [0.4 0.8] [1.0 1.0] [0.0 0.3]])
                        b (gen/elements [[0.4 0.6] [0.5 0.5] [0.4 0.8] [1.0 1.0] [0.0 0.3]])]
           (let [meets? #(not= :outside (facts/interval-class %1 %2))]
             (and (= (meets? a b) (meets? b a))
                  (or (not= :within (facts/interval-class a b)) (meets? b a)))))))
