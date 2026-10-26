# harukan-live

하루칸 앱의 내려받기 업데이트 묶음 (GitHub Pages).
- manifest.json: 최신 묶음 번호(build), 받을 수 있는 최소 앱 versionCode(minNative), 경로
- b<번호>/: 그 묶음의 앱 화면 파일과 live.json(파일 해시 목록)

만드는 도구: harukan 저장소의 harukan-native/tools/live-build.mjs
여기에 push 하면 사용자 앱이 바로 받아 간다. 사용자 승인 후에만 올린다.
