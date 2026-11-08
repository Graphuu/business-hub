"""Background consumers for push/streaming integrations (AWS SQS, GCP
Pub/Sub). Each active streaming pipeline gets one daemon thread that
polls its queue/subscription and appends received messages to its
bronze table via `ingestion.append_rows_to_table`.

Threads are tracked in-process only — `main.py`'s startup hook
re-starts any pipeline that was left `status="active"` from a previous
run, since restarting the process doesn't bring background threads
back on its own (DuckDB's on-disk state persists; Python threads do
not).
"""

import json
import threading
import traceback

from ingestion import append_rows_to_table, map_record

_stop_events: dict[str, threading.Event] = {}
_threads: dict[str, threading.Thread] = {}
_registry_lock = threading.Lock()

STREAMING_TYPES = ("aws_sqs", "gcp_pubsub")


def is_running(pipeline_id: str) -> bool:
    with _registry_lock:
        t = _threads.get(pipeline_id)
        return t is not None and t.is_alive()


def list_running() -> list[str]:
    with _registry_lock:
        return [pid for pid, t in _threads.items() if t.is_alive()]


def start_consumer(pipeline_id: str, integration: dict, source_config: dict, target_table: str) -> None:
    with _registry_lock:
        existing = _threads.get(pipeline_id)
        if existing is not None and existing.is_alive():
            return
        stop_event = threading.Event()
        thread = threading.Thread(
            target=_run_loop,
            args=(pipeline_id, integration, source_config, target_table, stop_event),
            daemon=True,
            name=f"stream-{pipeline_id[:8]}",
        )
        _stop_events[pipeline_id] = stop_event
        _threads[pipeline_id] = thread
        thread.start()


def stop_consumer(pipeline_id: str, timeout: float = 12.0) -> None:
    with _registry_lock:
        stop_event = _stop_events.get(pipeline_id)
        thread = _threads.get(pipeline_id)
    if stop_event:
        stop_event.set()
    if thread:
        thread.join(timeout=timeout)
    with _registry_lock:
        _stop_events.pop(pipeline_id, None)
        _threads.pop(pipeline_id, None)


def stop_all() -> None:
    for pid in list(list_running()):
        stop_consumer(pid, timeout=3.0)


def _run_loop(pipeline_id, integration, source_config, target_table, stop_event):
    itype = integration["type"]
    tag = pipeline_id[:8]
    print(f"[stream {tag}] starting {itype} consumer -> {target_table}")
    try:
        if itype == "aws_sqs":
            _consume_sqs(integration["config"], source_config, target_table, stop_event)
        elif itype == "gcp_pubsub":
            _consume_gcp_pubsub(integration["config"], source_config, target_table, stop_event)
        else:
            print(f"[stream {tag}] unsupported streaming type: {itype}")
    except Exception:
        print(f"[stream {tag}] consumer crashed:")
        traceback.print_exc()
    print(f"[stream {tag}] stopped")


def _consume_sqs(config: dict, source_config: dict, target_table: str, stop_event: threading.Event) -> None:
    import boto3

    client = boto3.client(
        "sqs",
        aws_access_key_id=config.get("aws_access_key_id") or None,
        aws_secret_access_key=config.get("aws_secret_access_key") or None,
        region_name=config.get("region"),
    )
    queue_url = config["queue_url"]
    field_mapping = source_config.get("field_mapping") or []

    while not stop_event.is_set():
        try:
            resp = client.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10, WaitTimeSeconds=10)
            messages = resp.get("Messages", [])
            if not messages:
                continue

            rows = []
            for m in messages:
                try:
                    body = json.loads(m["Body"])
                except (json.JSONDecodeError, TypeError):
                    body = {"raw": m["Body"]}
                rows.append(map_record(body, field_mapping))

            append_rows_to_table(target_table, rows)

            client.delete_message_batch(
                QueueUrl=queue_url,
                Entries=[{"Id": str(i), "ReceiptHandle": m["ReceiptHandle"]} for i, m in enumerate(messages)],
            )
        except Exception:
            print("[stream aws_sqs] batch failed, will retry in 5s:")
            traceback.print_exc()
            stop_event.wait(5)


def _consume_gcp_pubsub(config: dict, source_config: dict, target_table: str, stop_event: threading.Event) -> None:
    from google.cloud import pubsub_v1
    from google.oauth2 import service_account

    info = json.loads(config["credentials_json"]) if isinstance(config["credentials_json"], str) else config["credentials_json"]
    credentials = service_account.Credentials.from_service_account_info(info)
    subscriber = pubsub_v1.SubscriberClient(credentials=credentials)
    subscription_path = subscriber.subscription_path(config["project_id"], config["subscription_id"])
    field_mapping = source_config.get("field_mapping") or []

    def callback(message):
        try:
            try:
                body = json.loads(message.data.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                body = {"raw": message.data.decode("utf-8", errors="replace")}
            append_rows_to_table(target_table, [map_record(body, field_mapping)])
            message.ack()
        except Exception:
            print("[stream gcp_pubsub] message failed, nacking:")
            traceback.print_exc()
            message.nack()

    future = subscriber.subscribe(subscription_path, callback=callback)
    try:
        while not stop_event.is_set():
            stop_event.wait(1)
    finally:
        future.cancel()
        try:
            future.result(timeout=5)
        except Exception:
            pass
        subscriber.close()
