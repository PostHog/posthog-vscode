package main

import (
	"fmt"

	"github.com/posthog/posthog-go"
)

func main() {
	client, _ := posthog.NewWithConfig(
		"phc_test",
		posthog.Config{Endpoint: "https://us.posthog.com"},
	)
	defer client.Close()

	// Try typing inside the quotes — PostHog should autocomplete flag keys
	flag, _ := client.GetFeatureFlag("")

	enabled, _ := client.IsFeatureEnabled("")

	// Try typing inside the quotes — PostHog should autocomplete event names
	client.Capture("")

	fmt.Println(flag, enabled)
}
