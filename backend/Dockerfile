# syntax=docker/dockerfile:1.7

FROM gradle:8.13-jdk21 AS build
WORKDIR /app

# Keep dependency/plugin resolution in a reusable layer. Source changes should
# not force Docker to recreate this layer.
COPY gradlew build.gradle ./
COPY gradle ./gradle
RUN --mount=type=cache,id=know-gradle,target=/home/gradle/.gradle \
    ./gradlew dependencies --no-daemon

COPY src ./src
RUN --mount=type=cache,id=know-gradle,target=/home/gradle/.gradle \
    ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
