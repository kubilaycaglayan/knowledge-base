# syntax=docker/dockerfile:1.7

FROM gradle:8.13-jdk21 AS build
WORKDIR /app

# Keep dependency/plugin resolution in a reusable filesystem layer. External
# BuildKit caches retain this layer across the smoke test's temporary builders.
COPY gradlew build.gradle ./
COPY gradle ./gradle
RUN ./gradlew dependencies --no-daemon

COPY src ./src
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
