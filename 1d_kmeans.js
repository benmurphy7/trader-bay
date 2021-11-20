// Couple quick utilities
// compute the average of an array
function average(data) {
	let sum = 0;
	for(let i = 0, l = data.length; i < l; i++)
		sum += data[i];
	return sum / data.length;
}
// compute the variation of an array
function variation(data) {
	// sum of squares would be most correct but range can also work well for k-means
	return Math.max(...data) - Math.min(...data);
}
// find the max variation of all clusters
function max_variation(clusters) {
	let max = variation(clusters[0].data);
	for(let i = 1, l = clusters.length; i < l; i++) {
		let v = variation(clusters[i].data);
		if(v > max)
			max = v;
	}
	return max;
}

// k-means core - compute k-means for 1d data
function kmeans_1d(data, k) {
	// there need to be at least k unique values in data, but that isn't explicitly checked here
	// pick k random starting points
	let used_values = {}, // keep track of the values we've used
		clusters = [], // store clusters and their associated data points
		_ic = 0; // counter to make sure we don't get an infinite loop
	while(clusters.length < k) {
		let i = Math.floor(Math.random() * data.length);
		if(!used_values[data[i]]) { // don't pick a value twice (it'll result in a cluster with 0 data points, which will be bad)
			clusters.push({
				mean: data[i],
				data: []
			});
			used_values[data[i]] = true;
		}
		if(_ic++ >= k * 200) // safeguard infinite loop
			throw "error";
	}
	// iterate k-means
	while(true) {
		// clear potential cluster data points from previous iteration
		for(let i = 0, l = clusters.length; i < l; i++)
			clusters[i].data = [];
		// assign points to their nearest clusters
		for(let i = 0, l = data.length; i < l; i++) {
			let min_dist = Math.abs(data[i] - clusters[0].mean),
				min_dist_i = 0;
			for (let j = 1, lm = clusters.length; j < lm; j++) {
				let d = Math.abs(data[i] - clusters[j].mean);
				if(d < min_dist) {
					min_dist = d;
					min_dist_i = j;
				}
			}
			clusters[min_dist_i].data.push(data[i]);
		}
		// recalculate centroids
		let did_move = false;
		for(let i = 0, l = clusters.length; i < l; i++) {
			let centroid = average(clusters[i].data);
			if(centroid != clusters[i].mean) {
				clusters[i].mean = centroid;
				did_move = true;
			}
		}
		// stop when the centroids stop moving
		if(!did_move)
			break;
	}
	// return final solution
	return clusters;
}
// calculate the best k-means output of m runs
function kmeans_1d_m(data, k, m) {
	// run k-means m times
	let clusters = kmeans_1d(data, k),
		current_best_var = max_variation(clusters);
	while(m---1) { // beautiful syntax isn't it! we already did 1 k-means computation so this loop needs to do m - 1 iterations
		let _clusters = kmeans_1d(data, k),
			_variation = max_variation(_clusters);
		if(_variation < current_best_var) {
			current_best_var = _variation;
			clusters = _clusters;
		}
	}
	// return best of m runs
	return clusters;
}

// silhouette method for determining the number of clusters in a dataset (1d)
// compute a(i)
function silhouette_a(cluster, point) {
	let sum = 0;
	for(let pt of cluster.data) {
		sum += Math.abs(pt - point);
	}
	return 1 / (cluster.data.length - 1) * sum;
}
// compute b(i)
function silhouette_b(clusters, cluster_i, point) {
	let mean_dists = [];
	for(let i = 0; i < clusters.length; i++) {
		if(i == cluster_i)
			continue;
		let sum = 0;
		for(let pt of clusters[i].data) {
			sum += Math.abs(pt - point);
		}
		mean_dists.push(1 / clusters[i].data.length * sum);
	}
	return Math.min(...mean_dists); // no it's not elegant... TODO
}
// calculate the silhouette score of a data point
function silhouette_i(clusters, cluster_i, point) {
	if(clusters[cluster_i].data.length == 1)
		return 0;
	let a = silhouette_a(clusters[cluster_i], point),
		b = silhouette_b(clusters, cluster_i, point);
	return (b - a) / Math.max(a, b);
}
// calculate the global silhouette score (an average of s(i) over all data points)
function silhouette(clusters) {
	let sum = 0,
		count = 0;
	for(let i = 0; i < clusters.length; i++) {
		for(let j = 0; j < clusters[i].data.length; j++) {
			sum += silhouette_i(clusters, i, clusters[i].data[j]);
			count++;
		}
	}
	return sum / count;
}
// find the optimal number of clusters for the data k_min <= k <= k_max (m runs per k-means calculation)
function silhouette_find_k(data, k_min, k_max, m=10) {
	let _iclusters = kmeans_1d_m(data, k_min, m),
		best_s = silhouette(_iclusters),
		best_k = k_min;
	for(let k = k_min + 1; k <= k_max; k++) {
		let clusters = kmeans_1d_m(data, k, m),
			s = silhouette(clusters);
		if(s > best_s) {
			best_s = s;
			best_k = k;
		}
	}
	return best_k;
}

module.exports = { kmeans_1d };