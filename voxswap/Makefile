# Shortcuts. Everything here also works as a plain python3 command — see README.
.PHONY: help test demo example doctor watch clean lint

help:
	@echo "make demo     build the example order and run it end to end"
	@echo "make test     run the full offline test suite"
	@echo "make doctor   check this machine is ready"
	@echo "make watch    start the inbox watcher (auto-runs new orders)"
	@echo "make clean    delete intermediate work, keep customer data"

test:
	python3 -m unittest discover -s tests -t . -v

example:
	python3 tools/make_example.py

demo: example
	python3 -m voxswap run EXAMPLE-GAME
	@echo
	@echo "Delivery: delivery/EXAMPLE-GAME.zip"
	@echo "Open delivery/EXAMPLE-GAME/ to see what a customer receives."

doctor:
	python3 -m voxswap doctor

watch:
	python3 -m voxswap watch

# Removes generated work only. orders/ is customer data — use `voxswap purge`.
clean:
	rm -rf work delivery archive
	find . -name __pycache__ -type d -prune -exec rm -rf {} +

lint:
	python3 -m compileall -q voxswap tools tests
