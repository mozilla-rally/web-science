default:
	web-ext lint
	web-ext run
beta: check-ffbeta
	web-ext lint
	web-ext run --firefox=$(ffbetaloc)/firefox/firefox
dev: check-ffdev
	web-ext lint
	web-ext run --firefox=$(ffdevloc)/firefox/firefox

check-ffbeta:
ifndef ffbetaloc
	$(error ffbetaloc should be set to the location of a beta version of Firefox)
endif

check-ffdev:
ifndef ffdevloc
	$(error ffdevloc should be set to the location of a developer version of Firefox)
endif

docs:
	jsdoc . -c jsdoc-conf.json
.PHONY : docs
