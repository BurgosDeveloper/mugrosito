const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { fetchAllProducts } = require('../helpers/fetchAll');
const { requireRole } = require('../helpers/sessionAuth');

module.exports = function(io) {
  router.get('/', async (req, res) => {
    try {
      const products = await fetchAllProducts(req.user);
      res.json(products);
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener productos' });
    }
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    try {
      const { id: inputId, name, category, drinkType, price, priceSmall, description, image, badge, baseIngredients, proteinCount, defaultProteins, flavors } = req.body;
      const id = inputId || `prod-${Date.now()}`;
      const upperName = (name || '').trim().toUpperCase();
      const finalProteinCount = proteinCount !== undefined && proteinCount !== null ? parseInt(proteinCount, 10) : 1;
      const finalDefaultProteins = Array.isArray(defaultProteins) ? defaultProteins.map(p => (p || '').trim().toUpperCase()) : [];
      const finalBaseIngredients = Array.isArray(baseIngredients) ? baseIngredients.map(b => (b || '').trim().toUpperCase()) : [];
      const finalFlavors = Array.isArray(flavors) ? flavors.map(f => (f || '').trim()).filter(Boolean) : [];

      if (inputId) {
        await query(
          `UPDATE products SET name = $1, category = $2, drink_type = $3, price = $4, price_small = $5, description = $6, image = $7, badge = $8, base_ingredients = $9, protein_count = $10, default_proteins = $11, flavors = $12, shift = 'ambos' WHERE id = $13`,
          [upperName, category || 'Hot Dogs', drinkType || null, price || 0, priceSmall || null, description || '', image || '', badge || null, finalBaseIngredients, finalProteinCount, finalDefaultProteins, finalFlavors, inputId]
        );
      } else {
        await query(
          `INSERT INTO products (id, name, category, drink_type, price, price_small, description, image, badge, base_ingredients, protein_count, default_proteins, flavors, shift)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ambos')`,
          [id, upperName, category || 'Hot Dogs', drinkType || null, price || 0, priceSmall || null, description || '', image || '', badge || null, finalBaseIngredients, finalProteinCount, finalDefaultProteins, finalFlavors]
        );
      }

      const allProducts = await fetchAllProducts();
      io.emit('products:sync', allProducts);
      res.status(201).json(allProducts.find((p) => p.id === id) || { id, name: upperName });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear o actualizar producto' });
    }
  });

  router.put('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, category, drinkType, price, priceSmall, description, image, badge, baseIngredients, proteinCount, defaultProteins, flavors } = req.body;
      const upperName = (name || '').trim().toUpperCase();
      const finalProteinCount = proteinCount !== undefined && proteinCount !== null ? parseInt(proteinCount, 10) : 1;
      const finalDefaultProteins = Array.isArray(defaultProteins) ? defaultProteins.map(p => (p || '').trim().toUpperCase()) : [];
      const finalBaseIngredients = Array.isArray(baseIngredients) ? baseIngredients.map(b => (b || '').trim().toUpperCase()) : [];
      const finalFlavors = Array.isArray(flavors) ? flavors.map(f => (f || '').trim()).filter(Boolean) : [];

      await query(
        `UPDATE products SET name = $1, category = $2, drink_type = $3, price = $4, price_small = $5, description = $6, image = $7, badge = $8, base_ingredients = $9, protein_count = $10, default_proteins = $11, flavors = $12, shift = 'ambos' WHERE id = $13`,
        [upperName, category || 'Hot Dogs', drinkType || null, price || 0, priceSmall || null, description || '', image || '', badge || null, finalBaseIngredients, finalProteinCount, finalDefaultProteins, finalFlavors, id]
      );

      const allProducts = await fetchAllProducts();
      io.emit('products:sync', allProducts);
      res.json(allProducts.find((p) => p.id === id) || { success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar producto' });
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      await query(`DELETE FROM products WHERE id = $1`, [id]);
      const allProducts = await fetchAllProducts();
      io.emit('products:sync', allProducts);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar producto' });
    }
  });

  return router;
};
