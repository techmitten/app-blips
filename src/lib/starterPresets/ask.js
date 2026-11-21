import {
  Atom, Braces, Bug, Database, Gauge, Hourglass, Layers, Palette, Regex
} from 'lucide-react';

// Ask mode starter questions (one fixed set, no paging).
export const ASK_STARTER_PRESETS = [
  {
    title: "Explain React Hooks",
    prompt: "Can you explain how React hooks work, specifically useState and useEffect, with simple examples?",
    category: "React",
    icon: Atom,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Tailwind CSS Tips",
    prompt: "What are some best practices for using Tailwind CSS in a large React project?",
    category: "CSS",
    icon: Palette,
    color: "text-sky-600 bg-sky-50"
  },
  {
    title: "Fix a Bug",
    prompt: "I have a bug in my JavaScript code where a variable is undefined. What are the common causes and how do I debug it?",
    category: "Debugging",
    icon: Bug,
    color: "text-rose-600 bg-rose-50"
  },
  {
    title: "Optimize Performance",
    prompt: "What are the most effective ways to optimize the performance of a modern web application?",
    category: "Performance",
    icon: Gauge,
    color: "text-amber-600 bg-amber-50"
  },
  {
    title: "Explain Async/Await",
    prompt: "Can you explain JavaScript Promises and the async/await syntax in a way that is easy to understand?",
    category: "JavaScript",
    icon: Hourglass,
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    title: "Best Tech Stack",
    prompt: "What is the best modern tech stack for building a fast, scalable web application?",
    category: "Architecture",
    icon: Layers,
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    title: "Write a Regex",
    prompt: "Can you write and explain a regular expression that validates email addresses?",
    category: "Regex",
    icon: Regex,
    color: "text-violet-600 bg-violet-50"
  },
  {
    title: "Learn TypeScript",
    prompt: "What are the main benefits of using TypeScript over plain JavaScript, and how do I get started?",
    category: "TypeScript",
    icon: Braces,
    color: "text-blue-600 bg-blue-50"
  },
  {
    title: "Database Design",
    prompt: "How should I structure a SQL database for a simple e-commerce store with users, products, and orders?",
    category: "Database",
    icon: Database,
    color: "text-teal-600 bg-teal-50"
  }
];
