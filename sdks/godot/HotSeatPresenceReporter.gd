extends Node

@export var api_base_url := "https://hotseat.vercel.app"
@export var game_id := ""
@export var placement_id := ""
@export var server_id := ""

var _credential := ""
var _active_players := 0
var _pending_viewable_count := 0
var _reported_viewable_count := 0
var _presence_request: HTTPRequest
var _impression_request: HTTPRequest
var _timer: Timer


func _ready() -> void:
	if not OS.has_feature("dedicated_server") and DisplayServer.get_name() != "headless":
		return
	_credential = OS.get_environment("HOTSEAT_GAME_SERVER_CREDENTIAL")
	if server_id.is_empty():
		server_id = OS.get_environment("HOTSEAT_SERVER_ID")
	_presence_request = HTTPRequest.new()
	_impression_request = HTTPRequest.new()
	add_child(_presence_request)
	add_child(_impression_request)
	_impression_request.request_completed.connect(_on_impressions_completed)
	_timer = Timer.new()
	_timer.wait_time = 30.0
	_timer.timeout.connect(_report)
	add_child(_timer)
	_timer.start()
	_report()


func set_active_player_count(count: int) -> void:
	_active_players = maxi(0, count)


# Call on the trusted server after aggregating view callbacks; never send player IDs.
func add_viewable_impressions(count: int) -> void:
	if count > 0:
		_pending_viewable_count = mini(_pending_viewable_count + count, 100000)


func _report() -> void:
	if _credential.is_empty() or server_id.is_empty() or game_id.is_empty() or not api_base_url.begins_with("https://"):
		return
	var headers := ["Content-Type: application/json", "Authorization: Bearer " + _credential]
	var observed_at := int(Time.get_unix_time_from_system() * 1000.0)
	var presence := {"serverId": server_id, "activePlayers": _active_players, "observedAt": observed_at}
	_presence_request.request("%s/api/game-ads/games/%s/presence" % [api_base_url.trim_suffix("/"), game_id.uri_encode()], headers, HTTPClient.METHOD_POST, JSON.stringify(presence))
	if _pending_viewable_count <= 0 or placement_id.is_empty():
		return
	_reported_viewable_count = _pending_viewable_count
	var impressions := {"serverId": server_id, "viewableCount": _reported_viewable_count, "observedAt": observed_at}
	var error := _impression_request.request("%s/api/game-ads/placements/%s/impressions" % [api_base_url.trim_suffix("/"), placement_id.uri_encode()], headers, HTTPClient.METHOD_POST, JSON.stringify(impressions))
	if error != OK:
		_reported_viewable_count = 0


func _on_impressions_completed(result: int, response_code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	if result == HTTPRequest.RESULT_SUCCESS and response_code >= 200 and response_code < 300:
		_pending_viewable_count = maxi(0, _pending_viewable_count - _reported_viewable_count)
	_reported_viewable_count = 0
