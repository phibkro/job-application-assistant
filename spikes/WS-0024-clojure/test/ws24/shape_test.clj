(ns ws24.shape-test
  "Boundary and shape checks that are not WS-0020 falsifiers."
  (:require [clojure.test :refer [deftest is]]
            [ws24.facts :as facts]
            [ws24.fixtures :as fx]
            [ws24.nav :as nav]))

(deftest decode-requires-the-detail-envelope
  ;; Mirrors TS `NavSchema.Detail`: the bare advert must not partially match.
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"does not conform"
                        (nav/detail-observation (:ad_content fx/detail-active))))
  (is (= :incorrect (try (nav/feed-observations {:items [{:title "no entry"}]})
                         (catch clojure.lang.ExceptionInfo e (:anomaly (ex-data e)))))))

(deftest homogeneous-shape-two-sources-same-attributes
  (let [attr-set (fn [obs] (set (map :attr (facts/observation-facts obs))))]
    (is (= (set facts/attributes)
           (attr-set (fx/nav-detail fx/live-detail))
           (attr-set (first (nav/feed-observations fx/feed-page)))
           (attr-set (fx/posting "fixture-board" "b" "T"))))))

(deftest unmapped-nav-content-is-uniform-residue
  (let [r (facts/residue (fx/nav-detail fx/live-detail))]
    (is (= "3" (r "ad_content.positioncount")) "WS-0020 G5: positioncount survives as residue")
    (is (= "Fast" (r "ad_content.engagementtype")))))
