// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "Rift",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/hawkticehurst/rift" }],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "index" },
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Quick Start", slug: "getting-started/quick-start" },
          ],
        },
        {
          label: "Core Concepts",
          items: [
            { label: "Reactive Cells", slug: "concepts/reactive-cells" },
            { label: "Derived Values", slug: "concepts/derived-values" },
            { label: "Components", slug: "concepts/components" },
            { label: "Lists with For", slug: "concepts/lists" },
            { label: "Conditional Rendering", slug: "concepts/conditionals" },
            { label: "Event Handling", slug: "concepts/events" },
          ],
        },
        {
          label: "Advanced",
          items: [
            { label: "How Compilation Works", slug: "advanced/compilation" },
            { label: "Component Communication", slug: "advanced/component-communication" },
            { label: "Batching Updates", slug: "advanced/batching" },
            { label: "SVG Support", slug: "advanced/svg" },
          ],
        },
        {
          label: "API Reference",
          items: [
            { label: "Runtime API", slug: "reference/runtime" },
            { label: "Component API", slug: "reference/component-api" },
            { label: "JSX Syntax", slug: "reference/jsx-syntax" },
          ],
        },
        {
          label: "More",
          items: [
            { label: "Framework Comparison", slug: "comparison" },
            { label: "Examples", slug: "examples" },
          ],
        },
      ],
    }),
  ],
});
