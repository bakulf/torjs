.PHONY:
all: update install
	make -C external/ceba.js
	node_modules/.bin/web-ext build \
		--ignore-files "external/**/!(libdweb|src|toolkit|components|extensions|child|ext-tcp.js|schemas|tcp.json|ceba.js|build|tor.js)" \
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
