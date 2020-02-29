.PHONY:
all: update install
	make -C ceba.js

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
