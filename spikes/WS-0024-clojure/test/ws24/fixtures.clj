(ns ws24.fixtures
  "The checked-in `fixtures/nav/*.json` (read-only) and variants derived from
  them in code, as WS-0020 did. No new fixture files. The `fixture-board` /
  `fixture-ats` postings are fixture-only second sources (D04)."
  (:require [clojure.java.io :as io]
            [ws24.nav :as nav]))

(def fixture-dir
  (or (System/getProperty "ws24.fixtures") "../../fixtures/nav"))

(defn- load-fixture [name] (nav/read-json (io/file fixture-dir name)))

(def feed-page (load-fixture "feed-page.json"))
(def detail-active (load-fixture "detail-active.json"))
(def detail-nonmatching (load-fixture "detail-nonmatching.json"))
(def live-detail (load-fixture "live-detail.json"))

(def active-item (first (:items feed-page)))   ; active-vacancy-1, ACTIVE
(def inactive-item (second (:items feed-page))) ; inactive-vacancy-2, INACTIVE

(defn with-uuid [item uuid]
  (-> item (assoc :id (str "entry-" uuid) :url (str "/api/v1/feedentry/" uuid))
      (assoc-in [:_feed_entry :uuid] uuid)))

(defn with-status [item status modified]
  (-> item (assoc-in [:_feed_entry :status] status)
      (assoc :date_modified modified) (assoc-in [:_feed_entry :sistEndret] modified)))

(defn page [& items] (assoc feed-page :items (vec items)))

(defn detail
  "detail-active.json re-identified, optionally with an extent, a description
  sentence appended, a status, and a source-modified time."
  [uuid & {:keys [extent append status modified base] :or {base detail-active}}]
  (cond-> (-> base (assoc :uuid uuid) (assoc-in [:ad_content :uuid] uuid))
    extent (assoc-in [:ad_content :extent] extent)
    append (update-in [:ad_content :description] str "<p>" append "</p>")
    status (assoc :status status)
    modified (assoc :sistEndret modified)))

(def nav-detail nav/detail-observation)
(defn nav-feed [impl pg] ((:feed-observations impl) pg))

;; ---------------------------------------------------------------- workload cases (F5)

(def fifty "Stillingen er en 50 % stilling.")

(def workload-cases
  "external-id -> [observation expected-workload]. The contract's cases:
  50%, 40–80%, 100%, negotiable, `Deltid` with no %, nothing; plus summary-only
  and a within-advert contradiction so all seven states occur."
  {"wl-50" [(nav-detail (detail "wl-50" :append fifty))
            {:state :derived :fte [0.5 0.5] :class :within}]
   "wl-40-80" [(nav-detail (detail "wl-40-80" :append "Stillingsprosent 40–80 %."))
               {:state :derived :fte [0.4 0.8] :class :overlaps}]
   "wl-100" [(nav-detail (detail "wl-100" :extent "Heltid"))
             {:state :stated :fte [1.0 1.0] :schedule :full-time :class :outside}]
   "wl-negotiable" [(nav-detail (detail "wl-negotiable" :append "Stillingsprosent etter avtale."))
                    {:state :negotiable :class :undetermined}]
   ;; The recorded live NAV detail, unmodified: extent "Deltid", no percentage.
   (:uuid live-detail) [(nav-detail live-detail)
                        {:state :unsupported :schedule :part-time :class :undetermined}]
   "wl-nothing" [(nav-detail (detail "wl-nothing"))
                 {:state :unknown :class :undetermined}]
   "wl-temp" [(first (nav/feed-observations (page (with-uuid active-item "wl-temp"))))
              {:state :temp-unknown :class :undetermined}]
   "wl-conflict" [(nav-detail (detail "wl-conflict" :extent "Heltid" :append fifty))
                  {:state :conflicting :class :undetermined}]})

;; ---------------------------------------------------------------- second sources (F4, F5)

(defn posting
  [source id title & {:keys [org tax-id location work-hours url status modified]
                      :or {org "Example Technology AS" location "Oslo" status "ACTIVE"
                           modified "2026-08-05T09:00:00Z"}}]
  (nav/board-observation
   source
   (cond-> {:identifier id :title title :status status :dateModified modified
            :hiringOrganization (cond-> {:name org} tax-id (assoc :taxID tax-id))
            :jobLocation location}
     work-hours (assoc :workHours work-hours)
     url (assoc :url url))))
