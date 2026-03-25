FROM python:3.13.11

RUN apt-get update
RUN apt-get upgrade -y
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
RUN pip install uv

WORKDIR /workspace
COPY ./backend /workspace

EXPOSE 8000