package main

import (
	"fmt"

	"github.com/posthog/posthog-go"
)

const flagKey = "constant-flag"

func main() {
	// Constructor: posthog.NewWithConfig — should detect init call + client alias
	client, _ := posthog.NewWithConfig(
		"phc_test_token",
		posthog.Config{Endpoint: "https://us.posthog.com"},
	)
	defer client.Close()

	// Simple constructor
	simple := posthog.New("phc_simple")
	_ = simple

	// ── Feature flags — simple string arg ──

	flag, _ := client.GetFeatureFlag("my-flag")
	enabled, _ := client.IsFeatureEnabled("beta-feature")
	payload, _ := client.GetFeatureFlagPayload("config-flag")

	// ── Feature flags — struct-based ──

	flag2, _ := client.GetFeatureFlag(posthog.FeatureFlagPayload{
		Key:        "struct-flag",
		DistinctId: "user-1",
	})

	enabled2, _ := client.IsFeatureEnabled(posthog.FeatureFlagPayload{
		Key:        "struct-enabled",
		DistinctId: "user-1",
	})

	// ── Capture — struct-based ──

	client.Enqueue(posthog.Capture{
		DistinctId: "user-1",
		Event:      "purchase_completed",
		Properties: posthog.NewProperties().Set("amount", 42),
	})

	client.Enqueue(posthog.Capture{
		DistinctId: "user-1",
		Event:      "signup",
	})

	// ── Variant branches — if/else ──

	variant, _ := client.GetFeatureFlag("experiment")
	if variant == "control" {
		fmt.Println("control path")
	} else if variant == "test" {
		fmt.Println("test path")
	} else {
		fmt.Println("default path")
	}

	// ── Boolean enabled check ──

	on, _ := client.IsFeatureEnabled("dark-mode")
	if on == true {
		fmt.Println("dark mode on")
	} else {
		fmt.Println("dark mode off")
	}

	// ── Switch statement ──

	sv, _ := client.GetFeatureFlag("switch-exp")
	switch sv {
	case "a":
		fmt.Println("variant a")
	case "b":
		fmt.Println("variant b")
	default:
		fmt.Println("default variant")
	}

	// ── Constant reference ──
	client.GetFeatureFlag(flagKey)

	fmt.Println(flag, enabled, payload, flag2, enabled2)
}

// ── Method on a struct ──

type Analytics struct {
	client posthog.Client
}

func (a *Analytics) Track() {
	a.client.Enqueue(posthog.Capture{
		DistinctId: "user-1",
		Event:      "method_event",
	})
	a.client.GetFeatureFlag("method-flag")
}
