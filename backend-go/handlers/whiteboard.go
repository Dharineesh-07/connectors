package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/orgchat/backend/database"
	"github.com/orgchat/backend/middleware"
	"github.com/orgchat/backend/models"
	"gorm.io/gorm/clause"
)

type WhiteboardHandler struct{}

// whiteboardDraftResp is the JSON shape returned to the client. Pages and Notes
// are returned as raw JSON so they are proper arrays, not escaped strings.
type whiteboardDraftResp struct {
	ID             string          `json:"id"`
	ConversationID string          `json:"conversation_id"`
	CreatedBy      string          `json:"created_by"`
	Name           string          `json:"name"`
	Pages          json.RawMessage `json:"pages"`
	Notes          json.RawMessage `json:"notes"`
	IsSaved        bool            `json:"is_saved"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

func buildDraftResp(d models.WhiteboardDraft) whiteboardDraftResp {
	pages := json.RawMessage(d.Pages)
	notes := json.RawMessage(d.Notes)
	if len(pages) == 0 {
		pages = json.RawMessage("[]")
	}
	if len(notes) == 0 {
		notes = json.RawMessage("[]")
	}
	return whiteboardDraftResp{
		ID:             d.ID,
		ConversationID: d.ConversationID,
		CreatedBy:      d.CreatedByID,
		Name:           d.Name,
		Pages:          pages,
		Notes:          notes,
		IsSaved:        d.IsSaved,
		CreatedAt:      d.CreatedAt,
		UpdatedAt:      d.UpdatedAt,
	}
}

// verifyWhiteboardAccess checks conversation membership for collaborative boards.
// Personal boards (conversation_id == "__personal__") bypass the check.
func verifyWhiteboardAccess(convID string, userID string) bool {
	if convID == "__personal__" {
		return true
	}
	var m models.ConversationMember
	return database.DB.Where("conversation_id = ? AND user_id = ?", convID, userID).First(&m).Error == nil
}

// GET /api/conversations/:conversation_id/whiteboard
// Returns the latest draft for the conversation, 404 if none exists.
func (h *WhiteboardHandler) GetDraft(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)

	if !verifyWhiteboardAccess(convID, user.ID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "not a member"})
		return
	}

	var draft models.WhiteboardDraft
	query := database.DB.Where("conversation_id = ?", convID)
	if convID == "__personal__" {
		query = query.Where("created_by_id = ?", user.ID)
	} else {
		query = query.Order("updated_at DESC")
	}
	if err := query.First(&draft).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "no draft"})
		return
	}

	c.JSON(http.StatusOK, buildDraftResp(draft))
}

// PUT /api/conversations/:conversation_id/whiteboard
// Creates or updates the draft for the requesting user.
func (h *WhiteboardHandler) SaveDraft(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)

	if !verifyWhiteboardAccess(convID, user.ID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "not a member"})
		return
	}

	var req struct {
		Name  string          `json:"name"`
		Pages json.RawMessage `json:"pages"`
		Notes json.RawMessage `json:"notes"`
		// BaseUpdatedAt is the updated_at the client last saw. When set, the save
		// is rejected with 409 if the stored draft has moved on since — another
		// tab/device or collaborator wrote first — so we don't silently clobber it.
		BaseUpdatedAt *time.Time `json:"base_updated_at"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	pagesStr := string(req.Pages)
	notesStr := string(req.Notes)
	if pagesStr == "" || pagesStr == "null" {
		pagesStr = "[]"
	}
	if notesStr == "" || notesStr == "null" {
		notesStr = "[]"
	}

	// Optimistic-concurrency check against the existing row for this scope.
	if req.BaseUpdatedAt != nil {
		var existing models.WhiteboardDraft
		if err := database.DB.Where("conversation_id = ? AND created_by_id = ?", convID, user.ID).First(&existing).Error; err == nil {
			// 1s tolerance absorbs clock skew / sub-second timestamp rounding.
			if existing.UpdatedAt.After(req.BaseUpdatedAt.Add(time.Second)) {
				c.JSON(http.StatusConflict, gin.H{
					"detail": "draft was updated elsewhere",
					"draft":  buildDraftResp(existing),
				})
				return
			}
		}
	}

	// Atomic upsert keyed on the (conversation_id, created_by_id) unique index
	// (idx_wb_draft_scope). Collapsing create + update into one statement means
	// concurrent first-time saves can't race into a duplicate-key 500.
	draft := models.WhiteboardDraft{
		ConversationID: convID,
		CreatedByID:    user.ID,
		Name:           req.Name,
		Pages:          pagesStr,
		Notes:          notesStr,
	}
	if dbErr := database.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "conversation_id"}, {Name: "created_by_id"}},
		DoUpdates: clause.Assignments(map[string]any{
			"name":       req.Name,
			"pages":      pagesStr,
			"notes":      notesStr,
			"is_saved":   false,
			"updated_at": time.Now(),
		}),
	}).Create(&draft).Error; dbErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to save draft"})
		return
	}

	// Reload the canonical row so the response carries the real id + timestamps
	// (on conflict the generated insert id is discarded by the DB).
	if err := database.DB.Where("conversation_id = ? AND created_by_id = ?", convID, user.ID).First(&draft).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "draft saved but could not be reloaded"})
		return
	}

	c.JSON(http.StatusOK, buildDraftResp(draft))
}

// POST /api/conversations/:conversation_id/whiteboard/publish
// Marks the draft as saved/published (is_saved = true).
func (h *WhiteboardHandler) PublishDraft(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)

	if !verifyWhiteboardAccess(convID, user.ID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "not a member"})
		return
	}

	var draft models.WhiteboardDraft
	if err := database.DB.Where("conversation_id = ? AND created_by_id = ?", convID, user.ID).First(&draft).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "save a draft first"})
		return
	}

	if err := database.DB.Model(&draft).Update("is_saved", true).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to publish draft"})
		return
	}
	if err := database.DB.Where("conversation_id = ? AND created_by_id = ?", convID, user.ID).First(&draft).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "draft published but could not be reloaded"})
		return
	}

	c.JSON(http.StatusOK, buildDraftResp(draft))
}

// PATCH /api/conversations/:conversation_id/whiteboard/name
// Updates only the name of the requesting user's draft. Lightweight — no canvas data needed.
func (h *WhiteboardHandler) RenameDraft(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)

	if !verifyWhiteboardAccess(convID, user.ID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "not a member"})
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	result := database.DB.Model(&models.WhiteboardDraft{}).
		Where("conversation_id = ? AND created_by_id = ?", convID, user.ID).
		Update("name", req.Name)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to rename"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"detail": "draft not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"name": req.Name})
}

// GET /api/whiteboard/my-drafts
// Returns metadata for every whiteboard draft owned by the requesting user.
func (h *WhiteboardHandler) ListDrafts(c *gin.Context) {
	user := middleware.CurrentUser(c)

	var drafts []models.WhiteboardDraft
	database.DB.Where("created_by_id = ?", user.ID).Order("updated_at DESC").Find(&drafts)

	type draftItem struct {
		ID             string    `json:"id"`
		ConversationID string    `json:"conversation_id"`
		Name           string    `json:"name"`
		ConvName       *string   `json:"conversation_name"`
		IsSaved        bool      `json:"is_saved"`
		UpdatedAt      time.Time `json:"updated_at"`
	}

	items := make([]draftItem, 0, len(drafts))
	for _, d := range drafts {
		item := draftItem{
			ID:             d.ID,
			ConversationID: d.ConversationID,
			Name:           d.Name,
			IsSaved:        d.IsSaved,
			UpdatedAt:      d.UpdatedAt,
		}
		if d.ConversationID != "__personal__" {
			var conv models.Conversation
			if database.DB.Select("name").Where("id = ?", d.ConversationID).First(&conv).Error == nil {
				item.ConvName = conv.Name
			}
		}
		items = append(items, item)
	}

	c.JSON(http.StatusOK, items)
}

// DELETE /api/conversations/:conversation_id/whiteboard
// Deletes the requesting user's draft for the conversation. Idempotent: deleting
// a board that was never saved is a no-op and still returns 200.
func (h *WhiteboardHandler) DeleteDraft(c *gin.Context) {
	convID := c.Param("conversation_id")
	user := middleware.CurrentUser(c)

	if !verifyWhiteboardAccess(convID, user.ID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "not a member"})
		return
	}

	if err := database.DB.
		Where("conversation_id = ? AND created_by_id = ?", convID, user.ID).
		Delete(&models.WhiteboardDraft{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "failed to delete draft"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"deleted": true})
}
