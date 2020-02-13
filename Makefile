.PHONY:
all: update install
	make -C external/ceba.js
	cp external/ceba.js/build/tor.js src/tor
	node_modules/.bin/web-ext build \
		--ignore-files "external/**/!(ceba.js|build|tor.js)" \
		--ignore-files Makefile package.json package-lock.json \
		--overwrite-dest

.PHONY:
clean:
	rm -rf web-ext-artifacts

.PHONY:
update:
	git submodule update --init --recursive

.PHONY:
install: node_modules

.PHONY:
run: all
	MOZ_DISABLE_CONTENT_SANDBOX=1 web-ext run --firefox firefox-developer-edition

node_modules: package.json
	npm install
	touch node_modules
