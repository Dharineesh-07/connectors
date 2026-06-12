package utils

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/gif"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"github.com/orgchat/backend/config"
)

var allowedMIMETypes = map[string]bool{
	"image/jpeg": true, "image/png": true, "image/gif": true,
	"image/webp": true,
	"application/pdf": true,
	"application/msword": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
	"application/vnd.ms-excel":                                                  true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         true,
	"application/vnd.ms-powerpoint":                                              true,
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": true,
	"application/zip":         true,
	"application/x-zip-compressed": true,
	"text/plain":              true,
	"text/csv":                true,
	"audio/mpeg":              true,
	"audio/wav":               true,
	"audio/ogg":               true,
	"audio/webm":              true,
	"video/mp4":               true,
	"video/webm":              true,
	"video/ogg":               true,
}

func detectMIME(header []byte) string {
	switch {
	case len(header) >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF:
		return "image/jpeg"
	case len(header) >= 4 && bytes.Equal(header[:4], []byte{0x89, 0x50, 0x4E, 0x47}):
		return "image/png"
	case len(header) >= 3 && bytes.Equal(header[:3], []byte{0x47, 0x49, 0x46}):
		return "image/gif"
	case len(header) >= 12 && bytes.Equal(header[:4], []byte{0x52, 0x49, 0x46, 0x46}) && bytes.Equal(header[8:12], []byte{0x57, 0x45, 0x42, 0x50}):
		return "image/webp"
	case len(header) >= 4 && bytes.Equal(header[:4], []byte{0x25, 0x50, 0x44, 0x46}):
		return "application/pdf"
	case len(header) >= 4 && bytes.Equal(header[:4], []byte{0x50, 0x4B, 0x03, 0x04}):
		return "application/zip"
	case len(header) >= 3 && (bytes.Equal(header[:2], []byte{0xFF, 0xFB}) || bytes.Equal(header[:3], []byte{0x49, 0x44, 0x33})):
		return "audio/mpeg"
	case len(header) >= 8 && bytes.Equal(header[4:8], []byte{0x66, 0x74, 0x79, 0x70}):
		return "video/mp4"
	}
	return ""
}

type UploadResult struct {
	URL       string `json:"url"`
	FileName  string `json:"file_name"`
	FileSize  int64  `json:"file_size"`
	MIMEType  string `json:"mime_type"`
	Thumbnail string `json:"thumbnail"` // base64 data URL for images; empty for non-images
}

// generateThumbnail decodes an image and returns a tiny base64 JPEG data URL
// (≤40px wide) suitable for use as a blurred placeholder when the file expires.
// Returns "" if the MIME type is not a supported image or decoding fails.
func generateThumbnail(data []byte, mimeType string) string {
	switch mimeType {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
	default:
		return ""
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return ""
	}
	b := src.Bounds()
	origW, origH := b.Dx(), b.Dy()
	if origW == 0 || origH == 0 {
		return ""
	}
	const maxW = 40
	thumbW := maxW
	thumbH := (origH * thumbW) / origW
	if thumbH < 1 {
		thumbH = 1
	}
	// Nearest-neighbour downscale — no external deps required.
	dst := image.NewNRGBA(image.Rect(0, 0, thumbW, thumbH))
	for y := range thumbH {
		for x := range thumbW {
			sx := b.Min.X + (x*origW)/thumbW
			sy := b.Min.Y + (y*origH)/thumbH
			r, g, bl, a := src.At(sx, sy).RGBA()
			dst.SetNRGBA(x, y, color.NRGBA{
				R: uint8(r >> 8),
				G: uint8(g >> 8),
				B: uint8(bl >> 8),
				A: uint8(a >> 8),
			})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 20}); err != nil {
		return ""
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
}

func ValidateAndUpload(file *multipart.FileHeader, declaredMIME string) (*UploadResult, error) {
	maxBytes := config.App.MaxFileSizeMB * 1024 * 1024
	if file.Size > maxBytes {
		return nil, fmt.Errorf("file size %d exceeds limit of %dMB", file.Size, config.App.MaxFileSizeMB)
	}
	if !allowedMIMETypes[declaredMIME] {
		return nil, errors.New("file type not allowed")
	}

	f, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer f.Close()

	data, err := io.ReadAll(f)
	if err != nil {
		return nil, err
	}

	if len(data) >= 4 {
		// First try magic-byte detection for binary formats.
		detected := detectMIME(data[:min(len(data), 12)])
		if detected == "" {
			// Fall back to the stdlib sniffer (reads up to 512 bytes).
			detected = http.DetectContentType(data[:min(len(data), 512)])
			// http.DetectContentType always returns something; normalise the
			// generic fallback so it doesn't trigger a false mismatch.
			if detected == "application/octet-stream" {
				detected = ""
			}
		}
		if detected != "" && detected != declaredMIME {
			return nil, errors.New("file content does not match declared type")
		}
	}

	ext := filepath.Ext(file.Filename)
	safeFilename := uuid.New().String() + ext
	thumbnail := generateThumbnail(data, declaredMIME)

	if config.App.S3Bucket != "" {
		url, err := uploadToS3(data, safeFilename, declaredMIME)
		if err != nil {
			return nil, err
		}
		return &UploadResult{URL: url, FileName: file.Filename, FileSize: file.Size, MIMEType: declaredMIME, Thumbnail: thumbnail}, nil
	}
	return saveLocally(data, safeFilename, file.Filename, file.Size, declaredMIME, thumbnail)
}

func uploadToS3(data []byte, key, contentType string) (string, error) {
	cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(config.App.S3Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			config.App.AWSAccessKeyID,
			config.App.AWSSecretAccessKey,
			"",
		)),
	)
	if err != nil {
		return "", err
	}
	client := s3.NewFromConfig(cfg)
	_, err = client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(config.App.S3Bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", config.App.S3Bucket, config.App.S3Region, key), nil
}

func saveLocally(data []byte, safeFilename, originalName string, size int64, mimeType, thumbnail string) (*UploadResult, error) {
	dir := config.App.UploadsDir
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	dest := filepath.Join(dir, safeFilename)
	if err := os.WriteFile(dest, data, 0644); err != nil {
		return nil, err
	}
	url := "/uploads/" + safeFilename
	uploadsBase := strings.TrimPrefix(dir, "./")
	_ = uploadsBase
	return &UploadResult{URL: url, FileName: originalName, FileSize: size, MIMEType: mimeType, Thumbnail: thumbnail}, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// DeleteFile removes a previously uploaded file from local disk or S3.
// fileURL is the value stored in messages.file_url.
func DeleteFile(fileURL string) error {
	if config.App.S3Bucket != "" {
		// S3 URL: https://<bucket>.s3.<region>.amazonaws.com/<key>
		parts := strings.SplitN(fileURL, ".amazonaws.com/", 2)
		if len(parts) != 2 {
			return fmt.Errorf("unexpected S3 URL format: %s", fileURL)
		}
		key := parts[1]
		cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
			awsconfig.WithRegion(config.App.S3Region),
			awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
				config.App.AWSAccessKeyID,
				config.App.AWSSecretAccessKey,
				"",
			)),
		)
		if err != nil {
			return err
		}
		client := s3.NewFromConfig(cfg)
		_, err = client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
			Bucket: aws.String(config.App.S3Bucket),
			Key:    aws.String(key),
		})
		return err
	}
	// Local URL: /uploads/<filename>
	filename := strings.TrimPrefix(fileURL, "/uploads/")
	dest := filepath.Join(config.App.UploadsDir, filename)
	if err := os.Remove(dest); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
