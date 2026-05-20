package utils

import "time"

var IST *time.Location

func init() {
	var err error
	IST, err = time.LoadLocation("Asia/Kolkata")
	if err != nil {
		IST = time.FixedZone("IST", 5*60*60+30*60)
	}
}

func NowIST() time.Time {
	return time.Now().In(IST)
}
