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