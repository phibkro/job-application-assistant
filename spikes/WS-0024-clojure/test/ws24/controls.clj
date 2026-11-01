(ns ws24.controls
  "F7: one deliberately broken twin per falsifier. Each is `store/good` with
  exactly one strategy swapped. The controls runner rebinds `*impl*` to each
  twin and requires its target falsifier to FAIL."
  (:require [ws24.facts :as facts]
            [ws24.falsifiers-test :as f]
            [ws24.nav :as nav]
            [ws24.store :as s]))

(defn- title-identity
  "TS behaviour today (`deriveCanonicalKey` as identity, WS-0020 T4)."
  [obs]
  (let [fs (into {} (map (juxt :attr :value)) (facts/observation-facts obs))]
    (facts/blocking-key (fs :schema/title) (fs :schema/hiringOrganization) (fs :schema/jobLocation))))

(def ^:private non-recursive-rules
  (vec (butlast s/recursive-rules)))

(defn- missing-means-full-time [obs]
  (for [fact (facts/observation-facts obs)]
    (if (and (= :schema/workHours (:attr fact)) (#{:unknown :unsupported :temp-unknown} (:state fact)))
      (assoc fact :state :stated :fte [1.0 1.0])
      fact)))

(defn- midpoint-classify [q {:keys [state fte]}]
  (if (facts/determined state)
    (let [m (/ (+ (first fte) (second fte)) 2)] (facts/interval-class q [m m]))
    :undetermined))

(def controls
  [{:id "C1" :target #'f/f1-ingested-nav-vacancy-is-queryable-with-its-source-reference
    :broken "source reference read from the feed item `id` instead of `_feed_entry.uuid`"
    :impl (assoc s/good :feed-observations #(nav/feed-observations % :id))}
   {:id "C2" :target #'f/f2-identical-replay-is-a-semantic-no-op
    :broken "observation id includes a receipt nonce (not content-addressed)"
    :impl (assoc s/good :obs-id #(str (s/content-obs-id %) "@" (System/nanoTime)))}
   {:id "C3" :target #'f/f3-inactive-entry-propagates-as-visible-closure
    :broken "status = 'ever seen ACTIVE' (closure never propagates)"
    :impl (assoc s/good :status-of #(if (some (comp #{"ACTIVE"} :status) %) "ACTIVE" "INACTIVE"))}
   {:id "C4a" :target #'f/f4-identity-same-source-stays-split-cross-source-is-recursive-sameAs
    :broken "occurrence identity = title/employer/location (today's TS canonical key)"
    :impl (assoc s/good :occurrence-key title-identity)}
   {:id "C4b" :target #'f/f4-identity-same-source-stays-split-cross-source-is-recursive-sameAs
    :broken "same-vacancy rule without its recursive clause"
    :impl (assoc s/good :rules non-recursive-rules)}
   {:id "C4c" :target #'f/f4-identity-same-source-stays-split-cross-source-is-recursive-sameAs
    :broken "candidate generator links ambiguous candidates (transitive within-source merge)"
    :impl (assoc s/good :unambiguous? (constantly true))}
   {:id "C5a" :target #'f/f5-workload-query-separates-the-seven-fact-states
    :broken "missing workload treated as Stated 100%"
    :impl (assoc s/good :derive-facts missing-means-full-time)}
   {:id "C5b" :target #'f/f5-workload-query-separates-the-seven-fact-states
    :broken "interval collapsed to its midpoint (40–80% reported as one value)"
    :impl (assoc s/good :classify midpoint-classify)}
   {:id "C6a" :target #'f/f6-as-of-result-is-reproducible-after-later-observations
    :broken "as-of ignored (reads the current database)"
    :impl (assoc s/good :as-of (fn [_t] identity))}
   {:id "C6b" :target #'f/f6-late-arriving-older-observation-does-not-override-newer
    :broken "status by arrival (transaction) order, last write wins"
    :impl (assoc s/good :status-of (s/latest-status s/by-recorded-time))}])
