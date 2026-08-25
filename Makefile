SHELL := /bin/bash

ENV ?= dev
REGION ?= europe-west6
SERVICE ?= dual-wallet
# No default: the project belongs to whoever deploys this. Pass it on the
# command line or export it, for example PROJECT_ID=my-gcp-project.
PROJECT_ID ?=
IMAGE ?= eu.gcr.io/$(PROJECT_ID)/$(SERVICE):latest

# Name of the Secret Manager secret holding SESSION_SECRET, 32 bytes of base64
# from `openssl rand -base64 32`. Unset, the service seals sessions with a key
# derived from a constant in this repository, which is public and therefore no
# secret at all. Set it for any deployment that matters.
SESSION_SECRET_NAME ?=

# The session is a sealed cookie, not process-local state, so instances no
# longer have to be pinned to 1. Left at 1 until someone picks a ceiling.
MAX_INSTANCES ?= 1

API_URL ?= https://api.dual.network
VIEWER_BASE_DOMAIN ?= wallet.dual.network
NEXT_PUBLIC_APP_URL ?= https://wallet.dual.network
NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS ?= https://faces.dual.network
NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS ?= dual.dpp@1=https://faces.dual.network/dpp/v1/

.PHONY: help install dev build check test sdk-sync deploy-config-check image-build image-push deploy deploy-dev deploy-prod wallet wallet-dev wallet-prod

help:
	@echo "Local commands:"
	@echo "  make install       Install dependencies"
	@echo "  make dev           Start the local Next.js server"
	@echo "  make build         Create a local production build"
	@echo "  make check         Run typecheck, lint, and unit tests"
	@echo "  make test          Run unit tests"
	@echo "  make sdk-sync      Synchronize the generated web SDK"
	@echo "Deployment commands:"
	@echo "  make wallet-dev    Build, push, and deploy Cloud Run service '$(SERVICE)' to dev"
	@echo "  make wallet-prod   Build, push, and deploy Cloud Run service '$(SERVICE)' to prod"
	@echo "  make image-build   Build the deployment image for ENV=$(ENV)"
	@echo "  make image-push    Push the deployment image for ENV=$(ENV)"
	@echo "  make deploy        Deploy the existing image for ENV=$(ENV)"
	@echo "Deployment requires PROJECT_ID, and SESSION_SECRET_NAME for a real session key."

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

check:
	npm run check

test:
	npm test

sdk-sync:
	npm run sdk:sync

deploy-config-check:
	@case "$(ENV)" in dev|prod) ;; *) echo "ENV must be dev or prod" >&2; exit 1 ;; esac
	@test -n "$(PROJECT_ID)" || (echo "PROJECT_ID is required, for example PROJECT_ID=my-gcp-project" >&2; exit 1)
	@test -n "$(REGION)" || (echo "REGION is required" >&2; exit 1)
	@test -n "$(SERVICE)" || (echo "SERVICE is required" >&2; exit 1)
	@test -n "$(API_URL)" || (echo "API_URL is required" >&2; exit 1)
	@test -n "$(VIEWER_BASE_DOMAIN)" || (echo "VIEWER_BASE_DOMAIN is required" >&2; exit 1)
	@test -n "$(NEXT_PUBLIC_APP_URL)" || (echo "NEXT_PUBLIC_APP_URL is required" >&2; exit 1)
	@test -n "$(MAX_INSTANCES)" || (echo "MAX_INSTANCES is required" >&2; exit 1)
	@test -n "$(NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS)" || (echo "NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS is required" >&2; exit 1)
	@test -n "$(NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS)" || (echo "NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS is required" >&2; exit 1)
	@test -n "$(SESSION_SECRET_NAME)" || echo "WARNING: SESSION_SECRET_NAME is unset; sessions will be sealed with the public fallback key." >&2

image-build: deploy-config-check
	docker build \
		--network host \
		--platform linux/amd64 \
		--build-arg NEXT_PUBLIC_APP_URL="$(NEXT_PUBLIC_APP_URL)" \
		--build-arg NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS="$(NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS)" \
		--build-arg NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS="$(NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS)" \
		-t "$(IMAGE)" \
		.

image-push: deploy-config-check
	docker push "$(IMAGE)"

deploy: deploy-config-check
	gcloud run deploy "$(SERVICE)" \
		--project "$(PROJECT_ID)" \
		--region "$(REGION)" \
		--image "$(IMAGE)" \
		--allow-unauthenticated \
		--max-instances $(MAX_INSTANCES) \
		$(if $(SESSION_SECRET_NAME),--set-secrets "SESSION_SECRET=$(SESSION_SECRET_NAME):latest",) \
		--update-env-vars "^|^API_URL=$(API_URL)|VIEWER_BASE_DOMAIN=$(VIEWER_BASE_DOMAIN)|NEXT_PUBLIC_APP_URL=$(NEXT_PUBLIC_APP_URL)|NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS=$(NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS)|NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS=$(NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS)"

deploy-dev: ENV=dev
deploy-dev: deploy

deploy-prod: ENV=prod
deploy-prod: deploy

wallet: image-build image-push deploy

wallet-dev: ENV=dev
wallet-dev: wallet

wallet-prod: ENV=prod
wallet-prod: wallet
