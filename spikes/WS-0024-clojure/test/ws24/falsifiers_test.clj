(ns ws24.falsifiers-test
  "WS-0024 falsifiers F1–F6. Each test reads `*impl*`, so the controls runner
  can rebind it to a deliberately broken twin and watch the test fail (F7)."
  (:require [clojure.test :refer [deftest is testing]]
            [ws24.fixtures :as fx]
            [ws24.store :as s]))

(def ^:dynamic *impl* s/good)

(defn- by-xid [view]
  (into {} (for [v view, src (:sources v)] [(:external-id src) v])))

(def posting-url "https://arbeidsplassen.nav.no/stillinger/stilling/active-vacancy-1")

;; ---------------------------------------------------------------- F1

(deftest f1-ingested-nav-vacancy-is-queryable-with-its-source-reference
  (let [conn (s/fresh-conn)]
    (s/ingest! *impl* conn (fx/nav-feed *impl* fx/feed-page))
    (let [view (s/view *impl* conn {})
          active (filter :active? view)]
      (is (= 1 (count active)) "exactly the ACTIVE feed entry is an active vacancy")
      (let [[v] active]
        (is (= ["Technical Support Specialist" "Example Technology AS" "Oslo"]
               [(:title v) (:employer v) (:location v)]))
        (is (= [{:source "nav" :external-id "active-vacancy-1" :url posting-url :status "ACTIVE"}]
               (map #(dissoc % :observations) (:sources v)))
            "source reference = (source, NAV uuid) plus the posting URL")
        (is (= 1 (count (:observations (first (:sources v)))))
            "the reference resolves to the stored observation"))
      (testing "the INACTIVE entry is recorded, not dropped, and is not active"
        (is (= #{"inactive-vacancy-2"}
               (set (for [v view :when (not (:active? v)) src (:sources v)] (:external-id src)))))))))

;; ---------------------------------------------------------------- F2

(deftest f2-identical-replay-is-a-semantic-no-op
  (let [conn (s/fresh-conn)
        batch (concat (fx/nav-feed *impl* fx/feed-page) [(fx/nav-detail fx/detail-active)])
        first-run (s/ingest! *impl* conn batch)
        view-1 (s/view *impl* conn {})
        replay (s/ingest! *impl* conn batch)]
    (is (pos? (:datoms-added first-run)))
    (is (zero? (:datoms-added replay)) "replay asserts no datom besides the transaction's own")
    (is (= view-1 (s/view *impl* conn {})) "the query result is unchanged")
    (is (empty? (s/changed-occurrences-since conn (:t first-run)))
        "a change-cursor client resuming after the first run sees nothing")))

;; ---------------------------------------------------------------- F3

(deftest f3-inactive-entry-propagates-as-visible-closure
  (let [conn (s/fresh-conn)
        opened (s/ingest! *impl* conn (fx/nav-feed *impl* (fx/page fx/active-item)))
        closing (fx/with-status fx/active-item "INACTIVE" "2026-08-05T09:00:00Z")
        closed (s/ingest! *impl* conn (fx/nav-feed *impl* (fx/page closing)))
        status (fn [opts] (:active? (first (s/view *impl* conn opts))))]
    (is (false? (status {})) "now: closed")
    (is (true? (status {:recorded-t (:t opened)})) "as recorded before the closure: active")
    (is (true? (status {:valid-at #inst "2026-08-05T08:30:00Z"}))
        "valid time: the source says it was still active at 08:30")
    (is (= #{["nav|active-vacancy-1"]} (s/changed-occurrences-since conn (:t opened)))
        "the closure is visible through the change cursor")
    (is (pos? (:datoms-added closed)))))

;; ---------------------------------------------------------------- F4

(deftest f4-identity-same-source-stays-split-cross-source-is-recursive-sameAs
  (let [conn (s/fresh-conn)
        second-req (fx/with-uuid fx/active-item "active-vacancy-1-second-requisition")
        warehouse (fx/nav-detail (fx/detail "x-nav" :base fx/detail-nonmatching))
        board (fx/posting "fixture-board" "b-1" "Warehouse Operative"
                          :url "https://careers.example/jobs/100")
        ats (fx/posting "fixture-ats" "c-1" "Warehouse operative, nights"
                        :url "https://careers.example/jobs/100")
        ambiguous (fx/posting "fixture-board" "b-2" "Technical Support Specialist")]
    (s/ingest! *impl* conn (concat (fx/nav-feed *impl* (fx/page fx/active-item second-req))
                                   [warehouse board ats ambiguous]))
    ;; Deterministic candidates (blocking key + orgnr, unambiguous only) become links.
    (doseq [[a b ev] (s/candidate-links *impl* conn)]
      (s/link! conn a b ev "sameas-det/0"))
    ;; Explicit evidence: equal application URL between the two fixture sources.
    (s/link! conn ((:occurrence-key *impl*) ats) ((:occurrence-key *impl*) board)
             #{"applicationUrl equal"} "sameas-url/0")
    (let [view (s/view *impl* conn {})
          ids (by-xid view)]
      (is (apply distinct? (mapcat :vacancy view))
          "vacancies partition the occurrences: no occurrence is in two vacancies")
      (testing "D05: different externalId within NAV stays two vacancies"
        (is (not= (:vacancy (ids "active-vacancy-1"))
                  (:vacancy (ids "active-vacancy-1-second-requisition"))))
        (is (= 1 (count (:vacancy (ids "active-vacancy-1"))))))
      (testing "cross-source sameAs closes transitively: nav ~ board ~ ats"
        (is (= #{"nav|x-nav" "fixture-board|b-1" "fixture-ats|c-1"} (:vacancy (ids "x-nav")))))
      (testing "an ambiguous candidate is not linked, and nothing merges within a source"
        (is (= #{"fixture-board|b-2"} (:vacancy (ids "b-2"))))
        (is (empty? (s/within-source-merges *impl* (datomic.client.api/db conn))))))))

;; ---------------------------------------------------------------- F5

(deftest f5-workload-query-separates-the-seven-fact-states
  (let [conn (s/fresh-conn)]
    (s/ingest! *impl* conn (map first (vals fx/workload-cases)))
    (let [ids (by-xid (s/view *impl* conn {:fte-query [0.4 0.6]}))]
      (doseq [[xid [_ expected]] fx/workload-cases]
        (is (= expected (select-keys (:workload (ids xid)) (keys expected))) xid))
      (is (= #{:stated :derived :negotiable :conflicting :unknown :temp-unknown :unsupported}
             (set (map #(get-in (ids %) [:workload :state]) (keys fx/workload-cases)))))
      (is (= #{"wl-50"} (set (filter #(= :within (get-in (ids %) [:workload :class]))
                                     (keys fx/workload-cases))))
          "only the stated/derived 50% advert is within 40–60%; nothing absent counts as full-time")))
  (testing "fusion across a sameAs link: 50% (NAV) vs 100% (board) is Conflicting"
    (let [conn (s/fresh-conn)]
      (s/ingest! *impl* conn [(first (fx/workload-cases "wl-50"))
                              (fx/posting "fixture-board" "b-50" "Other title" :work-hours "100 %")])
      (s/link! conn "nav|wl-50" "fixture-board|b-50" #{"test link"} "sameas-test/0")
      (let [[v] (s/view *impl* conn {})]
        (is (= 2 (count (:vacancy v))))
        (is (= {:state :conflicting :class :undetermined}
               (select-keys (:workload v) [:state :class])))))))

;; ---------------------------------------------------------------- F6

(deftest f6-as-of-result-is-reproducible-after-later-observations
  (let [conn (s/fresh-conn)
        cases (vals fx/workload-cases)
        t1 (:t (s/ingest! *impl* conn (concat (fx/nav-feed *impl* fx/feed-page)
                                              (map first (take 4 cases)))))
        at-t1 (s/view *impl* conn {})]
    (s/ingest! *impl* conn
               (concat (map first (drop 4 cases))
                       (fx/nav-feed *impl* (fx/page (fx/with-status fx/active-item "INACTIVE"
                                                                    "2026-08-05T09:00:00Z")))
                       [(fx/nav-detail (fx/detail "wl-50" :append "Stillingsprosent 40–80 %."
                                                  :modified "2026-08-05T12:00:00Z"))]))
    (is (not= at-t1 (s/view *impl* conn {})) "later observations did change the present")
    (is (= at-t1 (s/view *impl* conn {:recorded-t t1})) "as-of t1 equals what was answered at t1")))

(deftest f6-late-arriving-older-observation-does-not-override-newer
  (let [conn (s/fresh-conn)
        closed-at-10 (fx/with-status fx/active-item "INACTIVE" "2026-08-05T10:00:00Z")
        active-at-09 (fx/with-status fx/active-item "ACTIVE" "2026-08-05T09:00:00Z")]
    (s/ingest! *impl* conn (fx/nav-feed *impl* (fx/page closed-at-10)))
    (s/ingest! *impl* conn (fx/nav-feed *impl* (fx/page active-at-09))) ; delayed delivery
    (is (false? (:active? (first (s/view *impl* conn {})))) "the newer source state wins")
    (is (true? (:active? (first (s/view *impl* conn {:valid-at #inst "2026-08-05T09:30:00Z"})))))))

(def falsifiers
  [#'f1-ingested-nav-vacancy-is-queryable-with-its-source-reference
   #'f2-identical-replay-is-a-semantic-no-op
   #'f3-inactive-entry-propagates-as-visible-closure
   #'f4-identity-same-source-stays-split-cross-source-is-recursive-sameAs
   #'f5-workload-query-separates-the-seven-fact-states
   #'f6-as-of-result-is-reproducible-after-later-observations
   #'f6-late-arriving-older-observation-does-not-override-newer])
