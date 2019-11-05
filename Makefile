default:
	web-ext lint
	web-ext run
ffloc = /home/anne/Downloads/ffbeta
beta:
	web-ext lint
	web-ext run --firefox=$(ffloc)/firefox/firefox
