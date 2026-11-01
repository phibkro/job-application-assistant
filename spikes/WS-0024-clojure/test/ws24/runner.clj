(ns ws24.runner
  "`test`: every suite against the good impl; exit 1 on any failure.
  `controls`: F7, each broken twin against its target falsifier; exit 0 only
  if every control made its target fail."
  (:require [clojure.test :as t]
            [ws24.controls :as controls]
            [ws24.falsifiers-test :as f]
            [ws24.laws-test]
            [ws24.shape-test]))

(defn- elapsed-ms [start] (quot (- (System/nanoTime) start) 1000000))

(defn- run-test []
  (let [start (System/nanoTime)
        {:keys [test pass fail error]} (t/run-tests 'ws24.falsifiers-test 'ws24.shape-test 'ws24.laws-test)]
    (println (format "WS24 SUMMARY tests=%d assertions=%d fail=%d error=%d wall_ms=%d"
                     test (+ pass fail error) fail error (elapsed-ms start)))
    (if (zero? (+ fail error)) 0 1)))

(defn- run-var [v]
  (binding [t/*report-counters* (ref t/*initial-report-counters*)]
    (t/test-vars [v])
    @t/*report-counters*))

(defn- run-controls []
  (let [start (System/nanoTime)
        rows (doall
              (for [{:keys [id target broken impl]} controls/controls]
                (do (println (str "\n==== " id " -> " (:name (meta target)) "\n     broken: " broken))
                    (let [{:keys [fail error]} (binding [f/*impl* impl] (run-var target))]
                      {:id id :target (:name (meta target)) :fail fail :error error
                       :control-failed? (pos? fail)}))))]
    (println "\nWS24 CONTROLS")
    (doseq [{:keys [id target fail error control-failed?]} rows]
      (println (format "  %-4s %-72s fail=%d error=%d => %s" id target fail error
                       (if control-failed? "FAILED as intended" "DID NOT FAIL"))))
    (println (format "WS24 CONTROLS SUMMARY controls=%d failed_as_intended=%d wall_ms=%d"
                     (count rows) (count (filter :control-failed? rows)) (elapsed-ms start)))
    (if (every? :control-failed? rows) 0 1)))

(defn -main [& [mode]]
  (let [code (case mode "controls" (run-controls) (run-test))]
    (shutdown-agents)
    (System/exit code)))
