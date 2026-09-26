# 电商作图平台 - 一条命令起停
#
#   make up        起全套（默认开发环境）
#   make down      停全套
#   make clean     停掉并且删数据卷，清空重来
#   make ps        看容器状态
#   make logs      跟日志
#   make health    打健康检查接口
#   make verify    把能自动查的检查一次跑完
#
# 换环境：
#   make up ENV=test
#   make up ENV=prod
#
# 三套环境用不同的项目名，容器和数据卷互相隔离。
#
# 配置文件的规矩：只有开发环境会自动从模板生成。
# 测试和线上缺了就直接停下报错，不会拿占位值糊弄过去。

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

.PHONY: up down clean ps logs health verify check-balance config

up:
	@if [ ! -f $(ENV_FILE) ]; then \
		if [ "$(ENV)" = "dev" ]; then \
			cp .env.example $(ENV_FILE); \
			echo "没有 $(ENV_FILE)，已从 .env.example 生成（只有开发环境会这么做）"; \
		else \
			echo ""; \
			echo "缺少配置文件 $(ENV_FILE)"; \
			echo "$(ENV) 环境不会自动生成配置，请先自己创建 $(ENV_FILE) 再运行 make up ENV=$(ENV)"; \
			echo "可以照 .env.example 写，但里面的密码必须换成真实值。"; \
			echo ""; \
			exit 1; \
		fi; \
	fi
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
	@test -f $(ENV_FILE) || (echo "缺少配置文件 $(ENV_FILE)" && exit 1)
	@PORT=$$(grep -E '^API_PORT=' $(ENV_FILE) | cut -d= -f2); \
	curl -fsS "http://localhost:$${PORT:-3001}/health" && echo

verify:
	@ENV=$(ENV) bash scripts/verify.sh

check-balance:
	@ENV=$(ENV) bash scripts/check-balance.sh

config:
	$(COMPOSE) config
