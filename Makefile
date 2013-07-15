all: man/mbcheck.1 man/mbcompact.1 man/mbpipe.1 man/mbrekey.1

man/%.1: ronn/%.md
	ronn --roff $< > $@
