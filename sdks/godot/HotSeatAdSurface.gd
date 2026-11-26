class_name HotSeatAdSurface
extends TextureRect

@export var api_base_url := "https://hotseat.vercel.app"
@export var placement_id := ""
@export var fallback_texture: Texture2D

var _cached_texture: ImageTexture
var _cached_valid_until_unix := 0
var _pending_valid_until_unix := 0
var _manifest_request: HTTPRequest
var _asset_request: HTTPRequest
var _refresh_timer: Timer


func _ready() -> void:
	texture = fallback_texture
	_manifest_request = HTTPRequest.new()
	_asset_request = HTTPRequest.new()
	_manifest_request.timeout = 5.0
	_asset_request.timeout = 5.0
	add_child(_manifest_request)
	add_child(_asset_request)
	_manifest_request.request_completed.connect(_on_manifest_completed)
	_asset_request.request_completed.connect(_on_asset_completed)
	_refresh_timer = Timer.new()
	_refresh_timer.wait_time = 15.0
	_refresh_timer.timeout.connect(_refresh_creative)
	add_child(_refresh_timer)
	_refresh_timer.start()
	_refresh_creative()


func _refresh_creative() -> void:
	if placement_id.is_empty() or not api_base_url.begins_with("https://"):
		_apply_cache_or_fallback()
		return
	var url := "%s/api/game-ads/placements/%s/creative" % [api_base_url.trim_suffix("/"), placement_id.uri_encode()]
	if _manifest_request.request(url, ["Cache-Control: no-cache"]) != OK:
		_apply_cache_or_fallback()


func _on_manifest_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
		_apply_cache_or_fallback()
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if not parsed is Dictionary or parsed.get("format") != "image":
		_apply_cache_or_fallback()
		return
	var asset: Dictionary = parsed.get("platformAsset", {})
	var asset_url: String = asset.get("assetUrl", "")
	_pending_valid_until_unix = _parse_valid_until(parsed.get("validUntil", ""))
	if asset_url.is_empty() or _pending_valid_until_unix <= Time.get_unix_time_from_system():
		_apply_cache_or_fallback()
		return
	var url := asset_url if asset_url.begins_with("https://") else api_base_url.trim_suffix("/") + asset_url
	if not url.begins_with("https://") or _asset_request.request(url) != OK:
		_apply_cache_or_fallback()


func _on_asset_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
		_apply_cache_or_fallback()
		return
	var image := Image.new()
	if image.load_png_from_buffer(body) != OK or image.is_empty():
		_apply_cache_or_fallback()
		return
	if Time.get_unix_time_from_system() >= _pending_valid_until_unix:
		_apply_cache_or_fallback()
		return
	_cached_texture = ImageTexture.create_from_image(image)
	_cached_valid_until_unix = _pending_valid_until_unix
	texture = _cached_texture


func _apply_cache_or_fallback() -> void:
	texture = _cached_texture if _cached_texture != null and Time.get_unix_time_from_system() < _cached_valid_until_unix else fallback_texture


func _parse_valid_until(value: String) -> int:
	var parts := value.trim_suffix("Z").split("T")
	if parts.size() != 2:
		return 0
	var date_parts := parts[0].split("-")
	var time_parts := parts[1].split(":")
	if date_parts.size() != 3 or time_parts.size() < 3:
		return 0
	return int(Time.get_unix_time_from_datetime_dict({
		"year": int(date_parts[0]), "month": int(date_parts[1]), "day": int(date_parts[2]),
		"hour": int(time_parts[0]), "minute": int(time_parts[1]), "second": int(time_parts[2]),
	}))
