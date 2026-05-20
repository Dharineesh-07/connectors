package middleware

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/store"
)

// in-memory fallback when Redis is unavailable
var (
	memMu      sync.Mutex
	memBuckets = make(map[string][]time.Time)
)

func LoginRateLimiter() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodPost {
			c.Next()
			return
		}
		ip := c.ClientIP()
		key := fmt.Sprintf("rl:login:%s", ip)
		const limit = 5
		const window = 60 * time.Second

		allowed := redisAllow(key, limit, window)
		if !allowed {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"detail": "too many login attempts, please try again in 60 seconds"})
			return
		}
		c.Next()
	}
}

func redisAllow(key string, limit int, window time.Duration) bool {
	ctx := context.Background()
	if store.RDB == nil {
		return memAllow(key, limit, window)
	}
	pipe := store.RDB.Pipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, window)
	if _, err := pipe.Exec(ctx); err != nil {
		return memAllow(key, limit, window)
	}
	return incr.Val() <= int64(limit)
}

func memAllow(key string, limit int, window time.Duration) bool {
	memMu.Lock()
	defer memMu.Unlock()
	now := time.Now()
	cutoff := now.Add(-window)
	times := memBuckets[key]
	var fresh []time.Time
	for _, t := range times {
		if t.After(cutoff) {
			fresh = append(fresh, t)
		}
	}
	if len(fresh) >= limit {
		memBuckets[key] = fresh
		return false
	}
	memBuckets[key] = append(fresh, now)
	return true
}
