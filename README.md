# 电商作图平台 - 基础架子

这一轮只搭架子，没有任何业务功能。没有注册，没有登录，没有余额，页面也没有按钮。

## 这里面有什么

三块应用。

web 是给客户看的网站，Next.js 写的。
api 是管业务的服务器，NestJS 写的，有一个健康检查接口。
worker 是在后面干活的进程，这轮只启动待命，不处理任何任务。

三个基础设施，都是真跑起来的，不是写在纸上的。

postgres 是数据库。
redis 是队列。
minio 是文件存储，存图片视频这类文件用。

## 开始之前

本机要装 Docker Desktop，并且要开着。

## 怎么起

进到本目录，敲一条命令。

```
make up
```

第一次跑会拉镜像、编译代码，要等几分钟。跑完之后三块应用和三个基础设施都起来了。

起来之后看状态。

```
make ps
```

想跟日志就敲。

```
make logs
```

## 怎么停

```
make down
```

三块应用和三个基础设施全停掉，容器删掉。数据还在，下次起来数据不会丢。

## 怎么清空重来

```
make clean
```

这个跟 down 的区别是，它会把数据卷一起删掉。数据库、队列、文件存储里的东西全部清空，回到全新状态。

下次再 `make up`，就是一个干干净净的新环境。

## 开发测试线上三套怎么切换

三套环境用三个不同的项目名，容器和数据卷完全隔开，互不影响。用 make clean ENV=test 只会清掉测试环境的东西，碰不到开发环境。

要注意的是，三套默认用同一组端口，所以同一时间只能跑一套。换环境之前先把当前的停掉。

```
make down
make up ENV=test
```

开发环境，默认就是它。

```
make up
```

测试环境。

```
make up ENV=test
```

线上环境。

```
make up ENV=prod
```

停的时候也要带上对应的 ENV。

```
make down ENV=test
```

三套的差别是这样的。

开发环境把应用端口和三个基础设施的端口都开到本机，方便直接连数据库、连队列、开 MinIO 控制台看文件。

测试环境和线上环境只开应用端口，三个基础设施留在容器内网，从外面连不进去。

线上环境所有服务都配了 always 重启。

三套的配置分别写在 docker-compose.dev.yml、docker-compose.test.yml、docker-compose.prod.yml 里，公共部分在 docker-compose.yml。

环境变量也是三份，分别是 .env.dev、.env.test、.env.prod。这三个文件不进仓库。仓库里只有模板 .env.example，make up 发现缺哪份就自动复制一份出来。

## 怎么确认真的起来了

下面每一步都实际敲过。

### 一、看容器

```
make ps
```

六个服务都应该是 running 或者 healthy。postgres、redis、minio 三个会显示 healthy。

### 二、看网站

浏览器打开 http://localhost:3000

能看到一个写着"电商作图"的页面。不白屏，不出错误页。

### 三、看服务器活着没

```
make health
```

或者直接敲。

```
curl http://localhost:3002/health
```

会返回一段 JSON，status 是 ok。

### 四、确认数据库、队列、文件存储真的接上了

先看健康检查接口的返回。

```
curl http://localhost:3002/health
```

返回里有 checks 这一段，database、queue、storage 三个都应该是 ok。

这个 ok 不是写死的，是服务器每次请求都真的去连一遍数据库、ping 一下队列、列一下文件存储的桶，连上了才回 ok。

然后可以自己在外面再验一遍，绕过应用，直接连基础设施。

连数据库。

```
docker exec dianshangzuotu-dev-postgres-1 psql -U dianshangzuotu -d dianshangzuotu -c 'select 1'
```

能查出结果就说明数据库真的在跑。

连队列。

```
docker exec dianshangzuotu-dev-redis-1 redis-cli ping
```

回 PONG 就说明队列真的在跑。

看文件存储。

浏览器打开 http://localhost:9001 ，这是 MinIO 的控制台。用 .env.dev 里的 MINIO_ACCESS_KEY 和 MINIO_SECRET_KEY 登录，用户名是 localdevaccess，密码是 localdevsecret。

登录进去能看到一个叫 assets 的桶。这个桶是 api 启动的时候自动建好的，说明应用真的连上存储了。

### 五、确认 worker 在待命

```
docker compose -p dianshangzuotu-dev -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev logs worker
```

日志里能看到 database connected、queue connected、storage connected，最后是 ready, waiting on queue "default"。

它连着队列在等任务，这轮不给它派活。

### 六、确认停得干净

```
make down
```

然后再敲。

```
docker ps -a
```

列表里找不到任何名字带 dianshangzuotu 的容器，说明停干净了，没有偷偷留着的。

## 代码和密钥

代码里没有硬编码任何密钥或密码。数据库密码、MinIO 密码这些全部通过环境变量传进去，代码只读环境变量。

.env.example 里填的是本地开发用的占位值，不是任何真实系统的凭据。.env.dev 是 make 自动从模板复制出来的，也在 .gitignore 里，不会进仓库。

测试和线上环境必须换成真实值。

## 目录结构

```
开发代码/
  Makefile                          一条命令起停的地方
  docker-compose.yml                公共编排
  docker-compose.dev.yml            开发环境差异
  docker-compose.test.yml           测试环境差异
  docker-compose.prod.yml           线上环境差异
  .env.example                      环境变量模板
  apps/web/                         网站，Next.js
  apps/api/                         服务器，NestJS
  apps/worker/                      干活进程，Node 加 BullMQ
```

## 端口占用

开发环境会用这些本机端口。

3000 网站
3002 服务器
5434 数据库
6380 队列
9000 文件存储接口
9001 文件存储控制台

这台机器上本来就有别的项目在跑，占了 3001、5432、6379，所以这几个端口故意错开用了。

换一台没冲突的机器，想改回 3001、5432、6379 也可以，改 .env.dev 里对应的值就行，容器里面用的还是标准端口，不受影响。
