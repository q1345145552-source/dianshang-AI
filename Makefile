# 电商作图平台 - 一条命令起停
#
#   make up        起全套（默认开发环境）
#   make down      停全套
#   make clean     停掉并且删数据卷，清空重来
#   make ps        看容器状态
#   make logs      跟日志
#   make health    打健康检查接口
#
# 换环境：
#   make up ENV=test
#   make up ENV=prod
#
# 三套环境用不同的项目名，容器和数据卷互相隔离，可以同时存在。

ENV ?= dev

ifeq ($(ENV),dev)
  OVERRIDE := docker-compose.dev.yml
else ifeq ($(ENV),test)
  OVERRIDE := docker-compose.test.yml
else ifeq ($(ENV),prod)
  OVERRIDE := docker-compose.prod.yml
else
  $(error ENV 只能是 dev / test / prod，收到的是 $(ENV))
endif

PROJECT  := dianshangzuotu-$(ENV)
ENV_FILE := .env.$(ENV)
COMPOSE  := docker compose -p $(PROJECT) -f docker-compose.yml -f $(OVERRIDE) --env-file $(ENV_FILE)

.PHONY: up down clean ps logs health config

up:
	@test -f $(ENV_FILE) || (cp .env.example $(ENV_FILE) && echo "没有 $(ENV_FILE)，已从 .env.example 生成")
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down --remove-orphans

clean:
	$(COMPOSE) down -v --remove-orphans

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f

health:
	@PORT=$$(grep -E '^API_PORT=' $(ENV_FILE) | cut -d= -f2); \
	curl -fsS "http://localhost:$${PORT:-3001}/health"; echo

config:
	$(COMPOSE) config
