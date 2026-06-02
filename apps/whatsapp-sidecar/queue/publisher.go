package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type JobContent struct {
	Text         string `json:"text,omitempty"`
	AudioID      string `json:"audioId,omitempty"`
	ImageID      string `json:"imageId,omitempty"`
	DocumentID   string `json:"documentId,omitempty"`
	FileName     string `json:"fileName,omitempty"`
	Caption      string `json:"caption,omitempty"`
	MimeType     string `json:"mimeType,omitempty"`
}

type JobData struct {
	From         string     `json:"from"`
	Content      JobContent `json:"content"`
	Type         string     `json:"type"`
	OrgID        string     `json:"orgId"`
	MessageID    string     `json:"messageId"`
	PhoneID      string     `json:"phoneId"`
	Timestamp    int64      `json:"timestamp"`
	Name         string     `json:"name,omitempty"`
	IsPinAttempt bool       `json:"isPinAttempt,omitempty"`
	}

	type Publisher struct {
	client     *redis.Client
	bizQueue   string
	lifeQueue  string
	}

	func NewPublisher(redisURL, bizQueue, lifeQueue string) (*Publisher, error) {	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	client := redis.NewClient(opts)
	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	return &Publisher{client: client, bizQueue: bizQueue, lifeQueue: lifeQueue}, nil
}

func (p *Publisher) GetHydratedOrgId(jid string) string {
	ctx := context.Background()
	orgId, err := p.client.Get(ctx, "sidecar_map:"+jid).Result()
	if err != nil {
		return jid // Fallback to raw JID if mapping not found
	}
	return orgId
}

func (p *Publisher) PublishMessage(job JobData) error {
	queueName := p.bizQueue
	if job.Type == "life-chat" {
		queueName = p.lifeQueue
	}

	payload, err := json.Marshal(job)
	if err != nil {
		return err
	}

	// BullMQ Job format in Redis:
	// LPUSH bull:<queueName>:wait <jobId>
	// HMSET bull:<queueName>:<jobId> data <payload> name <jobName> ...
	
	jobID := job.MessageID
	if jobID == "" {
		jobID = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	
	// Transaction to ensure atomicity
	pipe := p.client.Pipeline()
	
	// 1. Set Job Data
	jobKey := fmt.Sprintf("bull:%s:%s", queueName, jobID)
	pipe.HSet(context.Background(), jobKey, 
		"data", payload, 
		"name", "process-message",
		"timestamp", time.Now().UnixMilli(),
		"processedOn", 0,
		"finishedOn", 0,
		"attemptsMade", 0,
		"groupKey", job.OrgID, // Enable per-tenant grouping in BullMQ
	)
	
	// 2. Add to Wait List
	waitKey := fmt.Sprintf("bull:%s:wait", queueName)
	pipe.LPush(context.Background(), waitKey, jobID)
	
	_, err = pipe.Exec(context.Background())
	return err
}

func (p *Publisher) SetHumanLock(orgId, chatId string) error {
	ctx := context.Background()
	lockKey := fmt.Sprintf("human_active:%s:%s", orgId, chatId)
	// Set lock for 30 minutes
	return p.client.Set(ctx, lockKey, "true", 30*time.Minute).Err()
}
