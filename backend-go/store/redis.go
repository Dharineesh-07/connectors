package store

import (
	"context"
	"log"

	"github.com/orgchat/backend/config"
	"github.com/redis/go-redis/v9"
)

var RDB *redis.Client

func Connect() {
	opts, err := redis.ParseURL(config.App.RedisURL)
	if err != nil {
		log.Fatalf("invalid REDIS_URL: %v", err)
	}
	RDB = redis.NewClient(opts)

	if err := RDB.Ping(context.Background()).Err(); err != nil {
		log.Printf("warning: redis not available: %v — rate limiting will use in-memory fallback", err)
	}
}
