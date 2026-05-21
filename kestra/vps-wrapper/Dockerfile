FROM ghcr.io/vvjerome/us-z-3:latest
RUN mkdir -p /tmp/kestra-tmp
# Remove the broken standalone bbops stage
RUN sed -i 's/    _run_bbops(paths, env)/    # _run_bbops skipped — module missing, bbops runs in consumer stage/' /app/orchestrator/stage.py
# Patch zuhal_dispatcher: give up after 3 consecutive 429s instead of retrying forever
COPY patch_zuhal.py /tmp/patch_zuhal.py
RUN python3 /tmp/patch_zuhal.py
# Fix merge_outputs: column is confidence_score not zuhal_score
RUN sed -i 's/zuhal_score/confidence_score/g' /app/orchestrator/merge_outputs.py
