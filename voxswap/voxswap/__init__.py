"""VoxSwap — put a customer's own voice into the games and films they own.

Design rules that the rest of the code follows:

  * The core runs on a stock Python install. No pip, no numpy, no ffmpeg
    required — those are upgrades, not dependencies.
  * Consent is a hard gate, not a checkbox. See consent.py.
  * Every stage writes its output to disk, so any job resumes, and a re-run
    never re-pays for work that already succeeded.
  * Anything expensive happens as late as possible, after the cheap checks.
"""

__version__ = "0.1.0"
__all__ = ["__version__"]
