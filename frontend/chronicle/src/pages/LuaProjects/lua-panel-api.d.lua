---@meta

-- Chronicle Module API type definitions for Lua Language Server.
-- This file is documentation-only. Chronicle injects these globals at runtime.

---@alias ChronicleAnchor "TOPLEFT"|"TOP"|"TOPRIGHT"|"LEFT"|"CENTER"|"RIGHT"|"BOTTOMLEFT"|"BOTTOM"|"BOTTOMRIGHT"
---@alias ChronicleLayer "BACKGROUND"|"ARTWORK"|"OVERLAY"|number

---@class ChronicleRegion
local ChronicleRegion = {}

---Anchor this object within its parent. relativeTo and relativePoint are accepted for WoW compatibility but currently ignored.
---@param point ChronicleAnchor
---@param relativeTo? ChronicleRegion
---@param relativePoint? ChronicleAnchor
---@param x? number
---@param y? number
function ChronicleRegion:SetPoint(point, relativeTo, relativePoint, x, y) end

---Set this object's width and height in pixels.
---@param width number
---@param height number
function ChronicleRegion:SetSize(width, height) end

---Set this object's width in pixels.
---@param width number
function ChronicleRegion:SetWidth(width) end

---Set this object's height in pixels.
---@param height number
function ChronicleRegion:SetHeight(height) end

---Move this object to another frame.
---@param parent ChronicleFrame
function ChronicleRegion:SetParent(parent) end

---Set opacity from 0 through 1.
---@param alpha number
function ChronicleRegion:SetAlpha(alpha) end

---Set draw order using a named layer or numeric z-index.
---@param layer ChronicleLayer
function ChronicleRegion:SetLayer(layer) end

---Set the border color. Components are numbers from 0 through 1.
---@param red number
---@param green number
---@param blue number
---@param alpha? number
function ChronicleRegion:SetBorderColor(red, green, blue, alpha) end

---Show this object.
function ChronicleRegion:Show() end

---Hide this object.
function ChronicleRegion:Hide() end

---Return whether this object is shown.
---@return boolean shown
function ChronicleRegion:IsShown() end

---Remove this object and its callbacks.
function ChronicleRegion:Destroy() end

---@class ChronicleFrame: ChronicleRegion
local ChronicleFrame = {}

---Create a text object parented to this frame.
---@param id? string
---@return ChronicleFontString text
function ChronicleFrame:CreateFontString(id) end

---Create a texture object parented to this frame.
---@param id? string
---@return ChronicleTexture texture
function ChronicleFrame:CreateTexture(id) end

---Set foreground color. Components are numbers from 0 through 1.
---@param red number
---@param green number
---@param blue number
---@param alpha? number
function ChronicleFrame:SetColor(red, green, blue, alpha) end

---Set background color. Components are numbers from 0 through 1.
---@param red number
---@param green number
---@param blue number
---@param alpha? number
function ChronicleFrame:SetBackgroundColor(red, green, blue, alpha) end

---Register a supported callback. OnClick requires the input capability.
---@param script "OnClick"|"OnSizeChanged"
---@param callback fun(self:ChronicleFrame,...)
function ChronicleFrame:SetScript(script, callback) end

---@class ChronicleFontString: ChronicleRegion
local ChronicleFontString = {}

---Set displayed text, up to 4 KiB.
---@param text string
function ChronicleFontString:SetText(text) end

---Set font size in pixels.
---@param size number
function ChronicleFontString:SetFontSize(size) end

---Set text color. Components are numbers from 0 through 1.
---@param red number
---@param green number
---@param blue number
---@param alpha? number
function ChronicleFontString:SetColor(red, green, blue, alpha) end

---@class ChronicleTexture: ChronicleRegion
local ChronicleTexture = {}

---Render an image declared in project.json assets. The path is package-local and never treated as a URL.
---@param path string
function ChronicleTexture:SetTexture(path) end

---Render the current dataset's icon for a spell ID.
---@param spellId integer
---@param tooltip? boolean Show Chronicle's spell tooltip on hover. Defaults to false.
function ChronicleTexture:SetSpell(spellId, tooltip) end

---Render the current dataset's icon for an item ID.
---@param itemId integer
---@param tooltip? boolean Show Chronicle's item tooltip on hover. Defaults to false.
function ChronicleTexture:SetItem(itemId, tooltip) end

---Render a named icon from Chronicle's current dataset CDN. Names contain only ASCII letters, numbers, underscores, and hyphens. Paths and URLs are rejected.
---@param iconName string Example: "inv_sword_39".
function ChronicleTexture:SetIcon(iconName) end

---@class ChronicleButton: ChronicleFrame
local ChronicleButton = {}

---Set the button label.
---@param text string
function ChronicleButton:SetText(text) end

---Create a retained UI object. parent defaults to UIParent.
---@param frameType "Frame"|"FontString"|"Texture"|"Button"
---@param id? string
---@param parent? ChronicleFrame
---@return ChronicleFrame|ChronicleFontString|ChronicleTexture|ChronicleButton object
function CreateFrame(frameType, id, parent) end

---@type ChronicleFrame
UIParent = UIParent
