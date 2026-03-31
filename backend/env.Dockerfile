# 역할: JDK/uv 환경 구축
# 시스템 기반 설정임을 명시

FROM python:3.10.20

RUN apt-get update
RUN apt-get upgrade -y
RUN apt-get install -y openjdk-21-jdk
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
RUN pip install uv

ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"

WORKDIR /workspace

EXPOSE 8000