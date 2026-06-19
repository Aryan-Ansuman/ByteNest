export default function slugify(text: string) {
  return text
      .toString()
      .normalize('NFD') // Decompose combined characters
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks
      .toLowerCase()
      .trim() // Trim whitespace from both sides of the string
      .replace(/\s+/g, "-") // Replace spaces with a dash
      .replace(/[^\w\-]+/g, "") // Remove all non-word characters
      .replace(/\-\-+/g, "-"); // Replace multiple dashes with a single dash
}
