SHELL := /bin/sh

.PHONY: up start install help

HOST ?= 0.0.0.0
PORT ?= 3001

all: up

help:
	@echo "可用命令："
	@echo "  make up            - 安装依赖（如缺失）后启动 md 本地服务（前台运行）"
	@echo "  make start         - 同 make up"
	@echo "  make install       - 仅安装依赖（pnpm i）"

install:
	@command -v pnpm >/dev/null 2>&1 || (echo "未检测到 pnpm，请先安装: corepack enable && corepack prepare pnpm@latest --activate" && exit 1)
	pnpm i

up: install
	HOST=$(HOST) PORT=$(PORT) bash ./start.sh

start: up
