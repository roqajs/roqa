import { defineComponent } from 'rift-js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

import './styles.css';

function App() {
	let mixer;
	let controls;
	let renderer;
	let scene;
	let camera;
	let clock = new THREE.Clock();

	this.connected(() => {
		const container = this.querySelector('#container');

		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(window.innerWidth, window.innerHeight);
		container.appendChild(renderer.domElement);

		const pmremGenerator = new THREE.PMREMGenerator(renderer);

		scene = new THREE.Scene();
		scene.background = new THREE.Color(0xbfe3dd);
		scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

		camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 100);
		camera.position.set(5, 2, 8);

		controls = new OrbitControls(camera, renderer.domElement);
		controls.target.set(0, 0.5, 0);
		controls.update();
		controls.enablePan = false;
		controls.enableDamping = true;

		const dracoLoader = new DRACOLoader();
		dracoLoader.setDecoderPath('/draco/');

		const loader = new GLTFLoader();
		loader.setDRACOLoader(dracoLoader);
		loader.load(
			'/LittlestTokyo.glb',
			(gltf) => {
				const model = gltf.scene;
				model.position.set(1, 1, 0);
				model.scale.set(0.01, 0.01, 0.01);
				scene.add(model);
				mixer = new THREE.AnimationMixer(model);
				mixer.clipAction(gltf.animations[0]).play();
				renderer.setAnimationLoop(animate);
			},
			undefined,
			(e) => {
				console.error(e);
			}
		);

		window.onresize = () => {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
		};
	});
	
	const animate = () => {
		const delta = clock.getDelta();
		mixer.update(delta);
		controls.update();
		renderer.render(scene, camera);
	};

	return (
		<>
			<p id="info">
				<a href="https://artstation.com/artwork/1AGwX" target="_blank" rel="noopener">
					Littlest Tokyo
				</a> by
				<a href="https://artstation.com/glenatron" target="_blank" rel="noopener">
					Glen Fox
				</a>
				, CC Attribution.
			</p>
			<div id="container"></div>
		</>
	);
}

defineComponent('three-js', App);
