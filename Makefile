SHELL := /bin/bash

ENV ?= dev
REGION ?= europe-west6
SERVICE ?= dual-viewer
PROJECT_ID ?= $(if $(filter prod,$(ENV)),YOUR_GCP_PROD_PROJECT,YOUR_GCP_DEV_PROJECT)
IMAGE ?= eu.gcr.io/$(PROJECT_ID)/$(SERVICE):latest

API_URL ?= https://api.dual.network
VIEWER_BASE_DOMAIN ?= wallet.dual.network
NEXT_PUBLIC_APP_URL ?= https://wallet.dual.network
NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS ?= https://faces.dual.network
NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS ?= dual.dpp@1=https://faces.dual.network/dpp/v1/

.PHONY: help install dev build check test sdk-sync deploy-config-check image-build image-push deploy deploy-dev deploy-prod viewer viewer-dev viewer-prod

help:
	@echo "Local commands:"
	@echo "  make install       Install dependencies"
	@echo "  make dev           Start the local Next.js server"
	@echo "  make build         Create a local production build"
	@echo "  make check         Run typecheck, lint, and unit tests"
	@echo "  make test          Run unit tests"
	@echo "  make sdk-sync      Synchronize the generated web SDK"
	@echo "Deployment commands:"
	@echo "  make viewer-dev    Build, push, and deploy Cloud Run service 'dual-viewer' to dev"
	@echo "  make viewer-prod   Build, push, and deploy Cloud Run service 'dual-viewer' to prod"
	@echo "  make image-build   Build the deployment image for ENV=$(ENV)"
	@echo "  make image-push    Push the deployment image for ENV=$(ENV)"
	@echo "  make deploy        Deploy the existing image for ENV=$(ENV)"

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
	@test -n "$(PROJECT_ID)" || (echo "PROJECT_ID is required" >&2; exit 1)
	@test -n "$(REGION)" || (echo "REGION is required" >&2; exit 1)
	@test -n "$(SERVICE)" || (echo "SERVICE is required" >&2; exit 1)
	@test -n "$(API_URL)" || (echo "API_URL is required" >&2; exit 1)
	@test -n "$(VIEWER_BASE_DOMAIN)" || (echo "VIEWER_BASE_DOMAIN is required" >&2; exit 1)
	@test -n "$(NEXT_PUBLIC_APP_URL)" || (echo "NEXT_PUBLIC_APP_URL is required" >&2; exit 1)
	@test -n "$(NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS)" || (echo "NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS is required" >&2; exit 1)
	@test -n "$(NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS)" || (echo "NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS is required" >&2; exit 1)

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
		--max-instances 1 \
		--update-env-vars "^|^API_URL=$(API_URL)|VIEWER_BASE_DOMAIN=$(VIEWER_BASE_DOMAIN)|NEXT_PUBLIC_APP_URL=$(NEXT_PUBLIC_APP_URL)|NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS=$(NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_ORIGINS)|NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS=$(NEXT_PUBLIC_EXTERNAL_FACE_BRIDGE_APPLICATIONS)"

deploy-dev: ENV=dev
deploy-dev: deploy

deploy-prod: ENV=prod
deploy-prod: deploy

viewer: image-build image-push deploy

viewer-dev: ENV=dev
viewer-dev: viewer

viewer-prod: ENV=prod
viewer-prod: viewer
