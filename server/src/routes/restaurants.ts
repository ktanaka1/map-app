import { Router } from "express";

export const restaurantRouter = Router();

/**
 * GET /api/restaurants/search
 * 場所×キーワードで飲食店を検索する
 */
restaurantRouter.get("/search", async (_req, res) => {
  // TODO: googlePlacesService.search を呼び出す
  res.status(501).json({ message: "Not implemented" });
});

/**
 * GET /api/restaurants/:placeId/reviews
 * 飲食店のクチコミを取得する
 */
restaurantRouter.get("/:placeId/reviews", async (req, res) => {
  // TODO: googlePlacesService.getReviews を呼び出す
  const { placeId } = req.params;
  res.status(501).json({ message: "Not implemented", placeId });
});
