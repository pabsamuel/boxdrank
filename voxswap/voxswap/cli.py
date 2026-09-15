"""Command line interface.

Designed for one operator running a small studio, not for a devops team. Every
command prints what happened and what to do next, and destructive commands ask
first.

    python3 -m voxswap doctor                 is this machine ready?
    python3 -m voxswap new --help             scaffold an order folder
    python3 -m voxswap validate ORD-0001      check paperwork and assets, spend nothing
    python3 -m voxswap run ORD-0001           run the whole job
    python3 -m voxswap watch                  run every new order automatically
    python3 -m voxswap status ORD-0001        where is it?
    python3 -m voxswap phrase ORD-0001        the consent sentence to send the customer
    python3 -m voxswap revoke ORD-0001 C-1    record a withdrawal of consent
    python3 -m voxswap purge ORD-0001         destroy clones and generated audio
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from . import __version__
from .config import Config
from .consent import phrase_for, purge_order, record_revocation, verify_order
from .errors import VoxSwapError
from .ids import order_id_for, utc_now_iso
from .log import Logger
from .models import Order
from .pipeline import job_status, load_order, run_order
from .providers import catalogue
from .stages import STAGE_NAMES
from .state import JobState
from .watcher import SETTLE_SECONDS, scan, watch
from .workspace import Workspace

TEMPLATE = Path(__file__).resolve().parent.parent / "templates" / "order.template.json"


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------


def cmd_doctor(args: argparse.Namespace, cfg: Config, log: Logger) -> int:
    from .audio import ffmpeg as ff

    print(f"VoxSwap {__version__}")
    print(f"  python           {sys.version.split()[0]}")
    ok_ffmpeg = ff.available(cfg.ffmpeg, cfg.ffprobe)
    print(f"  ffmpeg           {'yes' if ok_ffmpeg else 'NO — install it for non-WAV input and better time-stretching'}")
    for label, path in (("orders", cfg.orders_dir), ("work", cfg.work_dir),
                        ("delivery", cfg.delivery_dir), ("archive", cfg.archive_dir)):
        print(f"  {label:<16} {path} {'' if path.exists() else '(will be created)'}")

    import os

    print("  API keys")
    for name, used_by in (("ELEVENLABS_API_KEY", "voice cloning + TTS"),
                          ("ANTHROPIC_API_KEY", "translation"),
                          ("OPENAI_API_KEY", "transcription")):
        print(f"    {name:<20} {'set' if os.environ.get(name) else 'not set':<8} ({used_by})")
    print("  providers")
    for kind, names in catalogue().items():
        print(f"    {kind:<12} {', '.join(names)}")
    print("\nEverything works offline with the 'mock' providers — no keys needed to test.")
    return 0


def cmd_new(args: argparse.Namespace, cfg: Config, log: Logger) -> int:
    order_id = args.order_id or order_id_for(args.email, args.title)
    order_dir = cfg.orders_dir / order_id
    if order_dir.exists() and any(order_dir.iterdir()):
        log.error(f"{order_dir} already exists and is not empty")
        return 1

    for sub in ("assets", "voices", "consent"):
        (order_dir / sub).mkdir(parents=True, exist_ok=True)

    data = json.loads(TEMPLATE.read_text(encoding="utf-8"))
    data["order_id"] = order_id
    data["created_at"] = utc_now_iso()
    data["customer"]["name"] = args.customer
    data["customer"]["email"] = args.email
    data["target"]["title"] = args.title
    data["target"]["kind"] = args.kind
    data["target"]["adapter"] = args.adapter or ("video" if args.kind == "movie" else "generic")
    data["language"]["source"] = args.source_language
    data["language"]["target"] = args.target_language
    (order_dir / "order.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Created {order_dir}\n")
    print("Next:")
    print(f"  1. Put the game/film audio under        {order_dir / 'assets'}")
    print(f"  2. Put the customer's voice samples in  {order_dir / 'voices' / 'main'}")
    print(f"  3. Save the signed consent form in      {order_dir / 'consent'}")
    print(f"  4. Send them the consent phrase:        python3 -m voxswap phrase {order_id}")
    print(f"  5. Edit roles[] and target.include in   {order_dir / 'order.json'}")
    print(f"  6. Check it:                            python3 -m voxswap validate {order_id}")
    return 0


def cmd_validate(args: argparse.Namespace, cfg: Config, log: Logger) -> int:
    order = load_order(cfg, args.order)
    checks = verify_order(order)
    print(f"Order {order.order_id} — {order.target.title}")
    print(f"  customer   {order.customer.name} <{order.customer.email}>")
    print(f"  target     {order.target.kind}/{order.target.adapter}, assets at {order.target.asset_root}")
    print(f"  language   {order.language.source} -> {order.language.target}")
    print(f"  roles      {', '.join(f'{r.display_name}->{r.voice_id}' for r in order.roles)}")
    print("  consent")
    for check in checks:
        print(f"    OK  {check.person_name:<24} {check.voice_id:<16} {check.sample_seconds:>6.1f}s of samples")
        for warning in check.warnings:
            print(f"        warning: {warning}")
    result = run_order(cfg, args.order, only_stage="intake", log=log)
    if not result.ok and result.error:
        return 1
    print("\nPaperwork and assets look fine. Dry run the matching next:")
    print(f"  python3 -m voxswap run {order.order_id} --only plan")
    return 0


def cmd_run(args: argparse.Namespace, cfg: Config, log: Logger) -> int:
    result = run_order(cfg, args.order, from_stage=args.from_stage or "",
                       only_stage=args.only or "", force=args.force, log=log)
    if result.ok and result.delivery:
        print(f"\nDelivery: {result.delivery.get('zip')}")
        print(f"QC report: {Workspace.for_order(cfg, result.order_id).report_dir / 'qc.md'}")
        return 0
    if result.status == "failed":
        print(f"\nStopped at [{result.failed_stage}]:\n  {result.error}", file=sys.stderr)
        print(f"\nFix it, then resume with:\n  python3 -m voxswap run {result.order_id} --from {result.failed_stage}",
              file=sys.stderr)
        return 1
    return 0


def cmd_watch(args: argparse.Namespace, cfg: Config, log: Logger) -> int:
    if args.dry_run:
        decisions = scan(cfg, settle_seconds=args.settle)
        if not decisions:
            print(f"No orders in {cfg.orders_dir}")
        for decision in decisions:
            print(f"  {decision.action:<5} {decision.order_id:<28} {decision.reason}")
        return 0
    results = watch(cfg, once=args.once, interval=args.interval, settle_seconds=args.settle, log=log)
    return 0 if all(r.ok for r in results) else 1


def cmd_status(args: argparse.Namespace, cfg: Config, log: Logger) -> int:
    if not args.order:
        return cmd_list(args, cfg, log)
    info = job_status(cfg, args.order)
    print(f"{info['order_id']} — {info['title']} for {info['customer']}")
    print(f"  status {info['status']}   updated {info['updated_at']}")
    for stage in info["stages"]:
        mark = {"done": "OK ", "skipped": "-- ", "failed": "!! ", "running": ">> "}.get(stage["status"], "   ")
        detail = stage["error"] or stage["summary"]
        seconds = f"{stage['duration_s']:.1f}s" if stage["duration_s"] else ""
        print(f"  {mark}{stage['name']:<12} {seconds:>8}  {detail}")
    if info["delivery"]:
        print(f"\n  delivery {info['delivery'].get('zip')}")
    elif info["next_stage"]:
        print(f"\n  next: {info['next_stage']}")
    return 0


def cmd_list(args: argparse.Namespace, cfg: Config, log: Logger) -> int:
    if not cfg.orders_dir.exists():
        print(f"No orders directory yet: {cfg.orders_dir}")
        return 0
    rows = []
    for order_dir in sorted(p for p in cfg.orders_dir.iterdir() if p.is_dir()):
        if not (order_dir / "order.json").exists():
            continue
        try:
            order = Order.load(order_dir)
            title, customer = order.target.title, order.customer.name
        except VoxSwapError as exc:
            rows.append((order_dir.name, "INVALID", exc.message[:48], ""))
            continue
        state = JobState(Workspace.for_order(cfg, order.order_id).state_file, order.order_id, STAGE_NAMES)
        rows.append((order.order_id, state.overall_status, title[:32], customer[:20]))
    if not rows:
        print(f"No orders in {cfg.orders_dir}")
        return 0
    print(f"{'ORDER':<28} {'STATUS':<10} {'TITLE':<34} CUSTOMER")
    for row in rows:
        print(f"{row[0]:<28} {row[1]:<10} {row[2]:<34} {row[3]}")
    return 0


def cmd_phrase(args: argparse.Namespace, cfg: Config, log: Logger) -> int:
    order = load_order(cfg, args.order)
    targets = [c for c in order.consents if not args.consent_ref or c.consent_ref == args.consent_ref]
    if not targets:
        log.error(f"no consent {args.consent_ref!r} in this order")
        return 1
    for consent in targets:
        print(f"\n--- {consent.consent_ref}: {consent.person_name} <{consent.person_email}> ---")
        print("Ask them to record this as a WAV and send it back:\n")
        print(f'  "{phrase_for(order, consent)}"\n')
        print(f"Save it as: {order.root / consent.phrase_audio}")
    return 0


def cmd_revoke(args: argparse.Namespace, cfg: Config, log: Logger) -> int:
    order = load_order(cfg, args.order)
    record_revocation(order.root, args.consent_ref, args.reason)
    print(f"Consent {args.consent_ref} marked as revoked in {order.root / 'order.json'}")
    print("Now destroy anything made from that voice:")
    print(f"  python3 -m voxswap purge {order.order_id} --consent-ref {args.consent_ref}")
    return 0


def cmd_purge(args: argparse.Namespace, cfg: Config, log: Logger) -> int:
    """Destroy clones and generated audio. This is the withdrawal path — it has
    to actually work, so it deletes at the provider too."""
    order = load_order(cfg, args.order)
    voices = [
        v for v in order.voices
        if (not args.voice or v.voice_id == args.voice)
        and (not args.consent_ref or v.consent_ref == args.consent_ref)
    ]
    if not voices:
        log.error("no matching voices in this order")
        return 1

    ws = Workspace.for_order(cfg, order.order_id)
    print(f"About to purge from order {order.order_id}:")
    for voice in voices:
        print(f"  - clone for {voice.person_label} ({voice.voice_id})"
              + (f" at provider: {voice.provider_voice_id}" if voice.provider_voice_id else " (no clone recorded)"))
    print(f"  - generated audio in {ws.root}")
    print(f"  - delivery {ws.delivery} and its ZIP")
    if args.samples:
        for voice in voices:
            print(f"  - ORIGINAL SAMPLES in {order.resolve(voice.samples_dir)}")
    if not args.yes:
        answer = input("\nType the order ID to confirm: ").strip()
        if answer != order.order_id:
            print("Aborted — nothing was deleted.")
            return 1

    result = purge_order(cfg, order, voice_id=args.voice, consent_ref=args.consent_ref,
                         samples=args.samples, log=log)
    for clone in result["clones_deleted"]:
        print(f"  deleted clone {clone} at {order.providers.voice}")
    print("\nPurged. The audit trail is in consent-audit.log.")
    return 0


def cmd_providers(args: argparse.Namespace, cfg: Config, log: Logger) -> int:
    for kind, names in catalogue().items():
        print(f"{kind:<12} {', '.join(names)}")
    print("\nSet them per order in order.json -> providers. 'mock' runs offline and costs nothing.")
    return 0


# --------------------------------------------------------------------------
# parser
# --------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="voxswap",
        description="Put a customer's own voice into the games and films they already own.",
    )
    parser.add_argument("--version", action="version", version=f"voxswap {__version__}")
    parser.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", help="check this machine is ready").set_defaults(func=cmd_doctor)
    sub.add_parser("providers", help="list available providers").set_defaults(func=cmd_providers)
    sub.add_parser("list", help="list all orders").set_defaults(func=cmd_list)

    new = sub.add_parser("new", help="create an empty order folder")
    new.add_argument("--customer", required=True)
    new.add_argument("--email", required=True)
    new.add_argument("--title", required=True, help="the game or film")
    new.add_argument("--kind", choices=("game", "movie"), default="game")
    new.add_argument("--adapter", choices=("generic", "unreal", "unity", "wwise", "video"), default="")
    new.add_argument("--source-language", default="en")
    new.add_argument("--target-language", default="en")
    new.add_argument("--order-id", default="")
    new.set_defaults(func=cmd_new)

    validate = sub.add_parser("validate", help="check an order without spending anything")
    validate.add_argument("order")
    validate.set_defaults(func=cmd_validate)

    run = sub.add_parser("run", help="run an order")
    run.add_argument("order")
    run.add_argument("--from", dest="from_stage", choices=STAGE_NAMES, help="re-run from this stage onward")
    run.add_argument("--only", choices=STAGE_NAMES, help="run just this stage")
    run.add_argument("--force", action="store_true", help="ignore cached results and redo the work")
    run.set_defaults(func=cmd_run)

    watch_cmd = sub.add_parser("watch", help="run new orders automatically as they arrive")
    watch_cmd.add_argument("--once", action="store_true", help="one pass, then exit")
    watch_cmd.add_argument("--interval", type=int, default=None, help="seconds between scans")
    watch_cmd.add_argument("--dry-run", action="store_true", help="show what would be picked up")
    watch_cmd.add_argument("--settle", type=int, default=SETTLE_SECONDS,
                           help="seconds an order must sit unchanged before it is started "
                                "(stops the watcher grabbing a half-finished upload)")
    watch_cmd.set_defaults(func=cmd_watch)

    status = sub.add_parser("status", help="where is an order?")
    status.add_argument("order", nargs="?")
    status.set_defaults(func=cmd_status)

    phrase = sub.add_parser("phrase", help="print the consent phrase to send the customer")
    phrase.add_argument("order")
    phrase.add_argument("--consent-ref", default="")
    phrase.set_defaults(func=cmd_phrase)

    revoke = sub.add_parser("revoke", help="record that someone withdrew consent")
    revoke.add_argument("order")
    revoke.add_argument("consent_ref")
    revoke.add_argument("--reason", default="withdrawn by the person")
    revoke.set_defaults(func=cmd_revoke)

    purge = sub.add_parser("purge", help="destroy clones and generated audio for an order")
    purge.add_argument("order")
    purge.add_argument("--voice", default="", help="only this voice_id")
    purge.add_argument("--consent-ref", default="", help="only voices under this consent")
    purge.add_argument("--samples", action="store_true", help="also delete the original recordings")
    purge.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    purge.set_defaults(func=cmd_purge)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    cfg = Config.from_env()
    cfg.ensure_dirs()
    log = Logger("debug" if args.verbose else cfg.log_level)
    try:
        return int(args.func(args, cfg, log))
    except VoxSwapError as exc:
        print(f"\nerror: {exc.render()}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        return 130
