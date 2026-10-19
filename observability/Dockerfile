FROM python:3.12-alpine
WORKDIR /app
COPY journey_probe.py oncall_agent.py ./
USER nobody
EXPOSE 9464 8081
CMD ["python", "/app/journey_probe.py"]
