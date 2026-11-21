// Gatsby Function: solo existe en el hosting (Gatsby Cloud / Netlify).
export default function handler(req, res) {
  res.json({ hola: 'mundo' });
}
