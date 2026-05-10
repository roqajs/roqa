<a href="https://roqa.dev">
	<img src="assets/banner.png" alt="Roqa – A UI framework that's built small, so you can build big." />
</a>
<div align="right">

_Banner design incorporates art from [The Met Open Access Collection](https://www.metmuseum.org/art/collection/search/436782)_

</div>

## What is Roqa?

Roqa is a universal rendering engine for the next generation of web frameworks.

A play on the word "baroque" –– a term to describe the ornate and elaborate style of art, architecture, and music from 17th and 18th century Europe –– Roqa is crafted to be small and fast, so *you* have the headroom to build grand, beautiful, and rich web experiences and applications.

## At a glance

Roqa is akin to a compile-time frontend framework, but instead of JSX or a custom DSL the compiler accepts the "Roqa IR" — a JSON-serializable intermediate representation that live inside `.roqa` files.

Just as LLVM did for programming languages, Roqa does for building reactive web frameworks and tooling. Whether it be JSX, TSRX, a custom DSL, a visual web builder, a programming language library, a CLI, literally whatever — as long as the authoring format can be converted to or output valid Roqa IR, the Roqa compiler will return unbelievably performant reactive web UIs.

## Creating Roqa authoring formats

If you're building a custom authoring format for Roqa, make use of the Vite and TypeScript based `create-roqa` template. 

```bash
npm create roqa@latest my-roqa-frontend
```

## Try it out

Want to build stuff with a Roqa-based authoring format? We ship canonical JSX and TSRX (coming soon) implementations that you can use to build regular ol' web apps.

Create a Roqa + JSX starter app with the following commands:

```bash
npm create roqa-jsx@latest my-app
cd my-app
npm install
npm run dev
```

## License

[MIT](./LICENSE)
