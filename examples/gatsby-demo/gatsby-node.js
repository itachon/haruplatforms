// Datos que Gatsby obtiene al compilar (normalmente de un CMS o API).
exports.sourceNodes = ({ actions, createNodeId, createContentDigest }) => {
  const data = { hola: 'mundo' };
  actions.createNode({
    ...data,
    id: createNodeId('saludo'),
    internal: { type: 'Saludo', contentDigest: createContentDigest(data) },
  });
};
