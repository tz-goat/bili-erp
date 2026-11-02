// const express = require('express');
import express from 'express'
const app = express();
const PORT = 3003;

// Middleware to parse JSON
app.use(express.json());
// 1. render html
// 2. get api, 数据获取
// 3. get all playlists data，请求处理


// Example BFF endpoint that aggregates data from mock backend services
app.get('/api/dashboard', async (req, res) => {
  const userId = req.query.userId || '1';

  try {
    // Simulate parallel calls to microservices (replace with real fetch/axios calls)
    // const [userRes, ordersRes] = await Promise.all([
    //   fetch(`https://api.internal{userId}`),
    //   fetch(`https://api.internal{userId}`)
    // ]);

    // Mock aggregated payload for the frontend
    const aggregatedData = {
      user: {
        id: userId,
        name: "Jane Doe",
        role: "Admin"
      },
      summary: {
        totalOrders: 12,
        activeCartItems: 2
      },
      // Stripped down or formatted specifically for this UI view
    };

    res.json(aggregatedData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

app.listen(PORT, () => {
  console.log(`BFF server running on http://localhost:${PORT}`);
});
