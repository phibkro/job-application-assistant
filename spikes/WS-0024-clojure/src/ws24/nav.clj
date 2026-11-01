(ns ws24.nav
  "Importers: source JSON -> observations. Pure functions, no store.

  An observation is what was received, in one homogeneous shape for every
  source: an envelope (source, external id, kind, status, source-modified
  time) plus a flat bag of raw claims `{path value}`. Mapping claims onto the
  closed JobPosting attribute set happens later, in `ws24.facts`, under a
  method version. Two importers live here: NAV (real, checked-in fixtures) and
  a fixture-only schema.org-shaped `board` source (D04: second sources are
  fixture-only)."
  (:require [clojure.data.json :as json]
            [clojure.spec.alpha :as s]
            [clojure.string :as str])
  (:import (java.time OffsetDateTime)
           (java.util Date)))

;; ---------------------------------------------------------------- specs
;; clojure.spec stands in for Malli (Clojars-only, unavailable). These mirror
;; the TS `NavSchema` requirements: the detail envelope is required, so a bare
;; advert without `ad_content` fails instead of partially matching.

(s/def ::nonblank (s/and string? (complement str/blank?)))
(s/def :nav.feed-entry/uuid ::nonblank)
(s/def :nav.feed-entry/status ::nonblank)
(s/def :nav.feed-item/_feed_entry
  (s/keys :req-un [:nav.feed-entry/uuid :nav.feed-entry/status]))
(s/def :nav.feed/items (s/coll-of (s/keys :req-un [:nav.feed-item/_feed_entry])))
(s/def ::feed-page (s/keys :req-un [:nav.feed/items]))

(s/def :nav.detail/uuid ::nonblank)
(s/def :nav.detail/status ::nonblank)
(s/def :nav.detail/ad_content map?)
(s/def ::detail (s/keys :req-un [:nav.detail/uuid :nav.detail/status :nav.detail/ad_content]))

(defn- decode-failed [source what spec value]
  (ex-info (str source " " what " does not conform")
           {:anomaly :incorrect :source source :what what
            :explain (s/explain-str spec value)}))

;; ---------------------------------------------------------------- helpers

(defn read-json [x] (json/read-str (if (string? x) x (slurp x)) :key-fn keyword))

(defn flatten-claims
  "Every non-null JSON leaf as `[path value-string]`. Paths are stable
  (`ad_content.workLocations[0].city`), so a claim bag is a pure function of
  the payload and can be content-addressed."
  ([m] (into (sorted-map) (flatten-claims "" m)))
  ([prefix v]
   (cond
     (map? v) (mapcat (fn [[k x]] (flatten-claims (str prefix (when (seq prefix) ".") (name k)) x)) v)
     (sequential? v) (mapcat (fn [i x] (flatten-claims (str prefix "[" i "]") x)) (range) v)
     (nil? v) []
     :else [[prefix (str v)]])))

(defn instant [s]
  (when-not (str/blank? s) (Date/from (.toInstant (OffsetDateTime/parse s)))))

(defn- present [s] (when-not (str/blank? s) s))

;; ---------------------------------------------------------------- NAV

(defn feed-observations
  "One observation per feed item, ACTIVE or not. Unlike the TS adapter, the
  INACTIVE entry is not filtered: it is a received fact about the source.
  `external-id-of` is injectable only so a negative control can swap it."
  ([page] (feed-observations page #(get-in % [:_feed_entry :uuid])))
  ([page external-id-of]
   (when-not (s/valid? ::feed-page page)
     (throw (decode-failed "nav" "feed page" ::feed-page page)))
   (for [item (:items page)
         :let [fe (:_feed_entry item)]]
     {:source "nav"
      :external-id (external-id-of item)
      :kind :feed-entry
      :status (str/upper-case (:status fe))
      :source-modified (instant (or (present (:date_modified item)) (:sistEndret fe)))
      :claims (flatten-claims item)})))

(defn detail-observation [detail]
  (when-not (s/valid? ::detail detail)
    (throw (decode-failed "nav" "detail" ::detail detail)))
  {:source "nav"
   :external-id (:uuid detail)
   :kind :detail
   :status (str/upper-case (:status detail))
   :source-modified (instant (or (present (:sistEndret detail))
                                 (get-in detail [:ad_content :updated])))
   :claims (flatten-claims detail)})

;; ---------------------------------------------------------------- fixture-only second source

(s/def :board/identifier ::nonblank)
(s/def :board/status ::nonblank)
(s/def :board/dateModified ::nonblank)
(s/def ::board-posting (s/keys :req-un [:board/identifier :board/status :board/dateModified]))

(defn board-observation
  "A schema.org-JobPosting-shaped posting from a fixture-only source. It
  exists to check the homogeneous shape: a second, differently shaped source
  must fit the same observation and Fact shape unchanged."
  [source posting]
  (when-not (s/valid? ::board-posting posting)
    (throw (decode-failed source "posting" ::board-posting posting)))
  {:source source
   :external-id (:identifier posting)
   :kind :detail
   :status (str/upper-case (:status posting))
   :source-modified (instant (:dateModified posting))
   :claims (flatten-claims posting)})
