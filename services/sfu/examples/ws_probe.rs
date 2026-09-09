use anyhow::Result;
use futures::{SinkExt, StreamExt};
use rtc::peer_connection::configuration::{
    interceptor_registry::register_default_interceptors, media_engine::MediaEngine,
    setting_engine::SettingEngine, RTCConfigurationBuilder, RTCIceServer,
};
use rtc::peer_connection::transport::{RTCIceCandidateInit, RTCIceCandidateType};
use rtc::peer_connection::{RTCPeerConnection, RTCPeerConnectionBuilder};
use rtc_interceptor::Interceptor;
use std::net::{IpAddr, SocketAddr};
use tokio::net::UdpSocket;
use tokio_tungstenite::connect_async;

async fn build_pc() -> Result<(
    RTCPeerConnection<impl Interceptor>,
    UdpSocket,
    std::net::SocketAddr,
)> {
    let mut media_engine = MediaEngine::default();
    media_engine.register_default_codecs()?;
    let registry =
        register_default_interceptors(rtc_interceptor::Registry::new(), &mut media_engine)?;

    let mut setting_engine = SettingEngine::default();
    let nat_ips: Vec<String> = std::env::var("SFU_NAT_1TO1_IPS")
        .unwrap_or_else(|_| "127.0.0.1".to_string())
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    setting_engine.set_nat_1to1_ips(nat_ips, RTCIceCandidateType::Host);

    let mut pc = RTCPeerConnectionBuilder::new()
        .with_configuration(
            RTCConfigurationBuilder::new()
                .with_ice_servers(vec![RTCIceServer {
                    urls: vec!["stun:stun.l.google.com:19302".to_string()],
                    ..Default::default()
                }])
                .build(),
        )
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .with_setting_engine(setting_engine)
        .build()?;

    let socket = UdpSocket::bind("0.0.0.0:0").await?;
    let socket_addr = socket.local_addr()?;
    let port = socket_addr.port();
    let local_ip: IpAddr = "127.0.0.1".parse()?;
    let local_addr = SocketAddr::new(local_ip, port);

    let mut candidate_init = RTCIceCandidateInit::default();
    candidate_init.candidate = format!(
        "candidate:1 1 udp 2130706431 {} {} typ host",
        local_addr.ip(),
        local_addr.port()
    );
    candidate_init.sdp_mid = Some("0".to_string());
    candidate_init.sdp_mline_index = Some(0);
    pc.add_local_candidate(candidate_init)?;

    Ok((pc, socket, local_addr))
}

async fn probe(n: usize) -> Result<()> {
    let (_pc, _socket, _local_addr) = build_pc().await?;
    let _socket2 = UdpSocket::bind("0.0.0.0:0").await?;
    let url = std::env::var("SFU_URL").unwrap_or_else(|_| "ws://127.0.0.1:18443".to_string());
    println!("{} connecting", n);
    let (ws, resp) = connect_async(&url).await?;
    println!("{} connected, status: {:?}", n, resp.status());
    let (mut ws_out, mut ws_in) = ws.split();
    let msg = tokio_tungstenite::tungstenite::Message::Text(
        r#"{"type":"join","room_id":"x","display_name":"a","user_id":"u","token":"x"}"#.to_string(),
    );
    ws_out.send(msg).await?;
    println!("{} sent join", n);
    if let Some(Ok(tokio_tungstenite::tungstenite::Message::Text(t))) = ws_in.next().await {
        println!("{} recv: {}", n, t);
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    let (a, b) = tokio::join!(probe(1), probe(2));
    a?;
    b?;
    Ok(())
}
